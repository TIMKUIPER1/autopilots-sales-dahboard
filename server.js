const http = require("http");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { CLOSER_STAGES, COUNTED_CALENDARS, SETTER_STAGES, TEAM } = require("./config");

const ROOT = __dirname;
const PUBLIC = fs.existsSync(path.join(ROOT, "public")) ? path.join(ROOT, "public") : ROOT;
const ENV = loadEnv(path.join(ROOT, ".env"));
const PORT = Number(process.env.PORT || ENV.PORT || 4173);
const DEFAULT_HOST = process.env.NODE_ENV === "production" ? "0.0.0.0" : "127.0.0.1";
const HOST = process.env.HOST || ENV.HOST || DEFAULT_HOST;
const LOCATION_ID = process.env.GHL_LOCATION_ID || ENV.GHL_LOCATION_ID || "fs9MG3kXRVSIiWUig6yv";
const GHL_TOKEN = process.env.GHL_PRIVATE_TOKEN || ENV.GHL_PRIVATE_TOKEN || "";
const SUPABASE_URL = process.env.SUPABASE_URL || ENV.SUPABASE_URL || "";
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || process.env.SUPABASE_PUBLISHABLE_KEY || ENV.SUPABASE_ANON_KEY || ENV.SUPABASE_PUBLISHABLE_KEY || "";
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || ENV.SUPABASE_SERVICE_ROLE_KEY || "";
const DEBUG_TOKEN = process.env.DEBUG_TOKEN || ENV.DEBUG_TOKEN || "";

const sessions = new Map();
const users = TEAM.map((member) => ({
  ...member,
  password: process.env[member.passwordEnv] || ENV[member.passwordEnv] || fallbackPassword(member)
}));

const server = http.createServer(async (req, res) => {
  try {
    const pathOnly = req.url.split("?")[0];
    if (pathOnly === "/api/login" && req.method === "POST") return login(req, res);
    if (pathOnly === "/api/logout" && req.method === "POST") return logout(req, res);
    if (pathOnly === "/api/me" && req.method === "GET") return me(req, res);
    if (pathOnly === "/api/dashboard" && req.method === "GET") return dashboard(req, res);
    if (pathOnly === "/api/debug/live-data" && req.method === "GET") return debugLiveData(req, res);
    if (pathOnly === "/health" && req.method === "GET") return health(res);
    if (pathOnly.startsWith("/api/calls/") && pathOnly.endsWith("/score") && req.method === "POST") return scoreCall(req, res);
    return staticFile(req, res);
  } catch (error) {
    json(res, 500, { error: "Er ging iets mis.", detail: error.message });
  }
});

server.listen(PORT, HOST, () => {
  console.log(`Autopilots Sales Dashboard draait op http://${HOST}:${PORT}`);
});

function loadEnv(file) {
  if (!fs.existsSync(file)) return {};
  return fs.readFileSync(file, "utf8").split(/\r?\n/).reduce((acc, line) => {
    const match = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (match) acc[match[1]] = match[2].trim();
    return acc;
  }, {});
}

async function login(req, res) {
  const body = await bodyJson(req);
  const email = String(body.email || "").trim().toLowerCase();
  const password = String(body.password || "");
  const user = users.find((item) => item.email.toLowerCase() === email && item.password === password);
  if (!user) return json(res, 401, { error: "Deze login klopt niet." });
  const sid = crypto.randomBytes(24).toString("hex");
  sessions.set(sid, { userId: user.id, createdAt: Date.now() });
  res.setHeader("Set-Cookie", sessionCookie(`ap_sales_sid=${sid}; Max-Age=28800`));
  json(res, 200, { user: publicUser(user) });
}

function logout(req, res) {
  const sid = cookie(req, "ap_sales_sid");
  if (sid) sessions.delete(sid);
  res.setHeader("Set-Cookie", sessionCookie("ap_sales_sid=; Max-Age=0"));
  json(res, 200, { ok: true });
}

function health(res) {
  json(res, 200, {
    ok: true,
    service: "autopilots-sales-dashboard",
    ghlConfigured: Boolean(GHL_TOKEN),
    supabaseConfigured: Boolean(SUPABASE_URL && (SUPABASE_SERVICE_ROLE_KEY || SUPABASE_ANON_KEY)),
    supabaseWritable: Boolean(SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY),
    timestamp: new Date().toISOString()
  });
}

function me(req, res) {
  const user = authUser(req);
  if (!user) return json(res, 401, { error: "Niet ingelogd." });
  json(res, 200, { user: publicUser(user) });
}

async function dashboard(req, res) {
  const user = authUser(req);
  if (!user) return json(res, 401, { error: "Niet ingelogd." });
  const data = await loadDashboardData();
  json(res, 200, filterForRole(data, user));
}

async function scoreCall(req, res) {
  const user = authUser(req);
  if (!user) return json(res, 401, { error: "Niet ingelogd." });
  const callId = req.url.split("/")[3];
  const data = await loadDashboardData();
  const call = data.calls.find((item) => item.id === callId);
  if (!call) return json(res, 404, { error: "Gesprek niet gevonden." });
  if (user.role === "setter" && call.ownerId !== user.id) return json(res, 403, { error: "Geen toegang tot dit gesprek." });
  json(res, 200, { score: scoreTranscript(call) });
}

async function debugLiveData(req, res) {
  const user = authUser(req);
  const token = new URL(req.url, "http://localhost").searchParams.get("token");
  const hasDebugToken = safeTokenMatch(token, DEBUG_TOKEN);
  if (!user && !hasDebugToken) return json(res, 401, { error: "Niet ingelogd." });
  if (user && user.role !== "admin") return json(res, 403, { error: "Alleen admin." });
  if (!GHL_TOKEN) return json(res, 400, { error: "GHL token ontbreekt." });
  const raw = await fetchRawGoHighLevelData();
  json(res, 200, buildDebugPayload(raw));
}

function safeTokenMatch(value, expected) {
  if (!value || !expected) return false;
  const valueBuffer = Buffer.from(value);
  const expectedBuffer = Buffer.from(expected);
  return valueBuffer.length === expectedBuffer.length && crypto.timingSafeEqual(valueBuffer, expectedBuffer);
}

async function loadDashboardData() {
  if (GHL_TOKEN && !GHL_TOKEN.includes("zet-je")) {
    try {
      const live = await fetchGoHighLevelData();
      if (live) return live;
    } catch (error) {
      console.warn("Live sync niet beschikbaar, demo-data wordt gebruikt:", error.message);
    }
  }
  return demoData();
}

async function fetchGoHighLevelData() {
  const raw = await fetchRawGoHighLevelData();
  return normalizeLiveData(raw);
}

async function fetchRawGoHighLevelData() {
  const [opportunities, conversations, calendars, voiceCallLogs, calendarEvents] = await Promise.all([
    safeFetch("opportunities", fetchOpportunities),
    safeFetch("conversations", fetchConversations),
    safeFetch("calendars", fetchCalendars),
    safeFetch("voiceCallLogs", fetchVoiceCallLogs),
    safeFetch("calendarEvents", fetchCalendarEventsForTeam)
  ]);
  return { opportunities, conversations, calendars, voiceCallLogs, calendarEvents };
}

async function safeFetch(label, fn) {
  try {
    return await fn();
  } catch (error) {
    console.warn(`${label} konden niet geladen worden:`, error.message);
    return [];
  }
}

async function ghl(endpoint) {
  const response = await fetch(`https://services.leadconnectorhq.com${endpoint}`, {
    headers: {
      Authorization: `Bearer ${GHL_TOKEN}`,
      Version: "2023-02-21",
      "Content-Type": "application/json"
    }
  });
  if (!response.ok) throw new Error(`GHL ${response.status}`);
  return response.json();
}

async function fetchOpportunities() {
  const items = [];
  for (let page = 1; page <= 10; page += 1) {
    const response = await ghl(`/opportunities/search?location_id=${encodeURIComponent(LOCATION_ID)}&status=all&limit=100&page=${page}`);
    const chunk = response.opportunities || response.data || [];
    items.push(...chunk);
    if (chunk.length < 100) break;
  }
  return items;
}

async function fetchConversations() {
  const items = [];
  for (let page = 1; page <= 10; page += 1) {
    const response = await ghl(`/conversations/search?locationId=${encodeURIComponent(LOCATION_ID)}&status=all&limit=100&page=${page}`);
    const chunk = response.conversations || response.data || [];
    items.push(...chunk);
    if (chunk.length < 100) break;
  }
  return items;
}

async function fetchCalendars() {
  try {
    const response = await ghl(`/calendars/?locationId=${encodeURIComponent(LOCATION_ID)}`);
    return response.calendars || response.data || [];
  } catch (error) {
    console.warn("Calendars konden niet geladen worden:", error.message);
    return [];
  }
}

async function fetchCalendarEventsForTeam() {
  const range = dateRange();
  const closers = users.filter((user) => user.role === "closer");
  const events = [];
  for (const closer of closers) {
    try {
      const response = await ghl(`/calendars/events?locationId=${encodeURIComponent(LOCATION_ID)}&userId=${encodeURIComponent(closer.ghlUserId)}&startTime=${range.weekStartMs}&endTime=${range.weekEndMs}`);
      events.push(...(response.events || response.data || []));
    } catch (error) {
      console.warn(`Calendar events voor ${closer.name} konden niet geladen worden:`, error.message);
    }
  }
  return events;
}

async function fetchVoiceCallLogs() {
  try {
    const range = dateRange();
    const response = await ghl(`/voice-ai/dashboard/call-logs?locationId=${encodeURIComponent(LOCATION_ID)}&startDate=${range.weekStartMs}&endDate=${range.weekEndMs}&pageSize=50&page=1&sortBy=createdAt&sort=descend`);
    return response.callLogs || response.data || [];
  } catch (error) {
    console.warn("Voice AI call logs konden niet geladen worden:", error.message);
    return [];
  }
}

function normalizeLiveData({ opportunities, conversations, calendars, voiceCallLogs, calendarEvents }) {
  const demo = demoData();
  const range = dateRange();
  const setterMembers = users.filter((user) => user.role === "setter");
  const closerMembers = users.filter((user) => user.role === "closer");
  const conversationOwnerByContactId = ownerByContact(conversations);
  const calendarNameById = Object.fromEntries((calendars || []).map((calendar) => [calendar.id, cleanName(calendar.name)]));
  const countedCalendarIds = new Set((calendars || [])
    .filter((calendar) => countedCalendarName(calendar.name))
    .map((calendar) => calendar.id));

  demo.rawSync = {
    mode: "live",
    opportunities: opportunities.length,
    conversations: conversations.length,
    calendarEvents: calendarEvents.length,
    voiceCallLogs: voiceCallLogs.length,
    syncedAt: new Date().toISOString()
  };

  demo.opportunityStageTotals = Object.fromEntries(Object.entries(SETTER_STAGES).map(([key, id]) => [
    key,
    opportunities.filter((item) => item.pipelineStageId === id || item.stageId === id).length
  ]));

  demo.closerStageTotals = Object.fromEntries(Object.entries(CLOSER_STAGES).map(([key, id]) => [
    key,
    opportunities.filter((item) => item.pipelineStageId === id || item.stageId === id).length
  ]));

  demo.setters = setterMembers.map((member) => {
    const assignedOpps = opportunities.filter((item) => opportunityOwner(item, conversationOwnerByContactId) === member.ghlUserId);
    const bingoCount = assignedOpps.filter((item) => stageId(item) === SETTER_STAGES.bingo).length;
    const nopeCount = assignedOpps.filter((item) => stageId(item) === SETTER_STAGES.nopeNotToday).length;
    const callConversations = conversations.filter((item) => assignedConversation(item) === member.ghlUserId && isCallConversation(item));
    const callsToday = callConversations.filter((item) => inRange(dateValue(item.lastMessageDate || item.updatedAt || item.dateUpdated), range.todayStart, range.now)).length;
    const callsWeek = callConversations.filter((item) => inRange(dateValue(item.lastMessageDate || item.updatedAt || item.dateUpdated), range.weekStart, range.now)).length;
    const answeredCalls = callConversations.filter((item) => isAnsweredConversation(item)).length;
    return {
      id: member.id,
      ghlUserId: member.ghlUserId,
      name: member.name,
      role: member.role,
      loginHours: 0,
      callsToday,
      callsWeek,
      answeredCalls,
      noShows: assignedOpps.filter((item) => hasNoShowSignal(item)).length,
      bingos: bingoCount,
      callsPerBingo: ratio(callsWeek, bingoCount),
      conversationsPerBingo: ratio(answeredCalls, bingoCount),
      bingosPerHour: 0,
      nopePerBingo: ratio(nopeCount, bingoCount)
    };
  });

  demo.closers = closerMembers.map((member) => {
    const assignedOpps = opportunities.filter((item) => opportunityOwner(item, conversationOwnerByContactId) === member.ghlUserId);
    const won = assignedOpps.filter((item) => stageId(item) === CLOSER_STAGES.dealClosed || item.status === "won").length;
    const lost = assignedOpps.filter((item) => stageId(item) === CLOSER_STAGES.dealLost || item.status === "lost").length;
    const events = calendarEvents.filter((event) => event.assignedUserId === member.ghlUserId || (event.users || []).includes(member.ghlUserId));
    const countedEvents = events.filter((event) => countedCalendarIds.has(event.calendarId) || countedCalendarName(calendarNameById[event.calendarId]) || countedCalendarName(event.title));
    const noShows = assignedOpps.filter((item) => stageId(item) === CLOSER_STAGES.noShow).length + countedEvents.filter((event) => appointmentStatus(event) === "no_show").length;
    return {
      id: member.id,
      ghlUserId: member.ghlUserId,
      name: member.name,
      role: member.role,
      loginHours: 0,
      showed: Math.max(0, countedEvents.length - noShows),
      meetings: countedEvents.length,
      won,
      lost,
      avgDaysToClose: averageDaysToClose(assignedOpps),
      closeRate: percentage(won, won + lost)
    };
  });

  demo.calls = normalizeCalls({ conversations, voiceCallLogs, setters: demo.setters, closers: demo.closers });
  demo.team = users.map(publicUser);
  demo.totals = buildTotals(demo.setters);

  return demo;
}

function filterForRole(data, user) {
  const result = structuredClone(data);
  result.viewer = publicUser(user);
  if (user.role === "setter") {
    result.team = result.team.filter((member) => member.id === user.id);
    result.calls = result.calls.filter((call) => call.ownerId === user.id);
    result.setters = result.setters.filter((setter) => setter.id === user.id);
    result.closers = [];
    const setterTotals = result.setters.find((setter) => setter.id === user.id);
    if (setterTotals) {
      result.totals = {
        ...result.totals,
        loginHours: setterTotals.loginHours,
        callsToday: setterTotals.callsToday,
        callsWeek: setterTotals.callsWeek,
        answeredCalls: setterTotals.answeredCalls,
        noShows: setterTotals.noShows,
        bingos: setterTotals.bingos,
        callsPerBingo: setterTotals.callsPerBingo,
        conversationsPerBingo: setterTotals.conversationsPerBingo,
        bingosPerHour: setterTotals.bingosPerHour,
        nopePerBingo: setterTotals.nopePerBingo
      };
    }
  }
  if (user.role === "closer") {
    result.team = result.team.filter((member) => member.id === user.id);
    result.calls = result.calls.filter((call) => call.ownerId === user.id || call.closerId === user.id);
    result.setters = [];
    result.closers = result.closers.filter((closer) => closer.id === user.id);
  }
  return result;
}

function dateRange() {
  const now = new Date();
  const todayStart = new Date(now);
  todayStart.setHours(0, 0, 0, 0);
  const weekStart = new Date(todayStart);
  const day = weekStart.getDay() || 7;
  weekStart.setDate(weekStart.getDate() - day + 1);
  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekEnd.getDate() + 7);
  return {
    now,
    todayStart,
    weekStart,
    weekStartMs: weekStart.getTime(),
    weekEndMs: weekEnd.getTime()
  };
}

function dateValue(value) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function inRange(date, start, end) {
  return date && date >= start && date <= end;
}

function stageId(item) {
  return item.pipelineStageId || item.stageId || item.pipeline_stage_id || "";
}

function assignedTo(item) {
  return item.assignedTo || item.assigned_to || item.assignedUserId || item.userId || "";
}

function opportunityOwner(item, conversationOwnerByContactId) {
  return assignedTo(item) || conversationOwnerByContactId[contactId(item)] || "";
}

function contactId(item) {
  return item.contactId || item.contact_id || item.contact?.id || "";
}

function ownerByContact(conversations) {
  return conversations.reduce((acc, conversation) => {
    const owner = assignedConversation(conversation);
    const id = contactId(conversation);
    if (id && owner && !acc[id]) acc[id] = owner;
    return acc;
  }, {});
}

function assignedConversation(item) {
  return item.assignedTo || item.assigned_to || item.assignedUserId || item.userId || "";
}

function isCallConversation(item) {
  const type = String(item.lastMessageType || item.type || "").toUpperCase();
  return type.includes("CALL") || type.includes("PHONE");
}

function isAnsweredConversation(item) {
  const body = String(item.lastMessageBody || item.body || "").toLowerCase();
  const direction = String(item.lastMessageDirection || item.direction || "").toLowerCase();
  return isCallConversation(item) && !body.includes("missed") && !body.includes("voicemail") && direction !== "missed";
}

function hasNoShowSignal(item) {
  return stageId(item) === CLOSER_STAGES.noShow || String(item.name || item.status || "").toLowerCase().includes("no show");
}

function cleanName(value) {
  return String(value || "").trim();
}

function countedCalendarName(value) {
  const name = cleanName(value);
  return COUNTED_CALENDARS.some((calendar) => cleanName(calendar) === name);
}

function appointmentStatus(event) {
  return String(event.appointmentStatus || event.status || "").trim().toLowerCase().replace("-", "_");
}

function ratio(numerator, denominator) {
  if (!denominator) return 0;
  return Number((numerator / denominator).toFixed(1));
}

function percentage(numerator, denominator) {
  if (!denominator) return 0;
  return Number(((numerator / denominator) * 100).toFixed(1));
}

function averageDaysToClose(opportunities) {
  const won = opportunities.filter((item) => stageId(item) === CLOSER_STAGES.dealClosed || item.status === "won");
  const days = won.map((item) => {
    const started = dateValue(item.createdAt || item.dateAdded || item.created_at);
    const closed = dateValue(item.lastStatusChangeAt || item.lastStageChangeAt || item.updatedAt || item.dateUpdated);
    if (!started || !closed) return null;
    return (closed - started) / 86400000;
  }).filter((value) => typeof value === "number" && value >= 0);
  if (!days.length) return 0;
  return Number((days.reduce((sum, value) => sum + value, 0) / days.length).toFixed(1));
}

function normalizeCalls({ conversations, voiceCallLogs, setters, closers }) {
  const closerId = closers[0] ? closers[0].id : "";
  const callLogs = voiceCallLogs.map((log, index) => {
    const owner = setters.find((setter) => setter.ghlUserId === log.agentId) || setters[index % Math.max(1, setters.length)];
    return {
      id: log.id || `voice-call-${index}`,
      ownerId: owner ? owner.id : "",
      closerId,
      owner: owner ? owner.name : "Setter",
      contact: log.contactName || log.contactId || "Contact",
      date: String(log.createdAt || "").slice(0, 10),
      duration: secondsToClock(log.duration || 0),
      answered: Number(log.duration || 0) > 0,
      result: hasAppointmentAction(log) ? "Bingo" : "Call",
      score: 0,
      transcript: log.transcript || log.summary || "Nog geen transcriptie beschikbaar."
    };
  });

  if (callLogs.length) return callLogs;

  return conversations
    .filter(isCallConversation)
    .slice(0, 20)
    .map((conversation, index) => {
      const owner = setters.find((setter) => setter.ghlUserId === assignedConversation(conversation)) || setters[index % Math.max(1, setters.length)];
      return {
        id: conversation.id || `conversation-call-${index}`,
        ownerId: owner ? owner.id : "",
        closerId,
        owner: owner ? owner.name : "Setter",
        contact: conversation.fullName || conversation.contactName || conversation.phone || "Contact",
        date: String(conversation.lastMessageDate || conversation.updatedAt || conversation.dateUpdated || "").slice(0, 10),
        duration: "",
        answered: isAnsweredConversation(conversation),
        result: "Call",
        score: 0,
        transcript: conversation.lastMessageBody || "Nog geen transcriptie beschikbaar."
      };
    });
}

function hasAppointmentAction(log) {
  return (log.executedCallActions || []).some((action) => action.actionType === "APPOINTMENT_BOOKING");
}

function secondsToClock(seconds) {
  const mins = Math.floor(Number(seconds || 0) / 60);
  const secs = Math.floor(Number(seconds || 0) % 60);
  return `${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
}

function buildTotals(setters) {
  const total = (key) => setters.reduce((sum, item) => sum + Number(item[key] || 0), 0);
  const callsWeek = total("callsWeek");
  const answeredCalls = total("answeredCalls");
  const bingos = total("bingos");
  const loginHours = total("loginHours");
  return {
    loginHours: Number(loginHours.toFixed(1)),
    callsToday: total("callsToday"),
    callsWeek,
    answeredCalls,
    noShows: total("noShows"),
    bingos,
    callsPerBingo: ratio(callsWeek, bingos),
    conversationsPerBingo: ratio(answeredCalls, bingos),
    bingosPerHour: ratio(bingos, loginHours),
    nopePerBingo: setters.length ? Number((setters.reduce((sum, item) => sum + Number(item.nopePerBingo || 0), 0) / setters.length).toFixed(1)) : 0
  };
}

function buildDebugPayload({ opportunities, conversations, calendars, voiceCallLogs, calendarEvents }) {
  const conversationOwnerByContactId = ownerByContact(conversations);
  return {
    generatedAt: new Date().toISOString(),
    counts: {
      opportunities: opportunities.length,
      conversations: conversations.length,
      calendars: calendars.length,
      voiceCallLogs: voiceCallLogs.length,
      calendarEvents: calendarEvents.length
    },
    authStatus: opportunities.length || conversations.length || calendars.length || voiceCallLogs.length || calendarEvents.length
      ? "GHL gaf minimaal een dataset terug."
      : "GHL gaf geen datasets terug. Controleer Private Integration token en scopes; 401 betekent unauthorized.",
    configuredTeam: users.map((user) => ({
      name: user.name,
      role: user.role,
      ghlUserId: user.ghlUserId
    })),
    configuredStages: {
      setter: SETTER_STAGES,
      closer: CLOSER_STAGES
    },
    observedOpportunityStages: countBy(opportunities, stageId),
    observedOpportunityAssignees: countBy(opportunities, assignedTo),
    observedOpportunityOwnersWithConversationFallback: countBy(opportunities, (item) => opportunityOwner(item, conversationOwnerByContactId)),
    observedConversationAssignees: countBy(conversations, assignedConversation),
    observedConversationTypes: countBy(conversations, (item) => item.lastMessageType || item.type || "unknown"),
    observedCalendars: calendars.map((calendar) => ({
      id: calendar.id,
      name: calendar.name,
      counted: countedCalendarName(calendar.name)
    })),
    observedCalendarEventStatuses: countBy(calendarEvents, (event) => event.appointmentStatus || "unknown"),
    observedCalendarEventTitles: countBy(calendarEvents, (event) => event.title || "unknown"),
    samples: {
      opportunities: opportunities.slice(0, 5).map(sampleOpportunity),
      conversations: conversations.slice(0, 5).map(sampleConversation),
      calendarEvents: calendarEvents.slice(0, 5).map(sampleCalendarEvent),
      voiceCallLogs: voiceCallLogs.slice(0, 5).map(sampleVoiceCallLog)
    },
    notes: [
      "Als observedOpportunityAssignees niet matcht met configuredTeam.ghlUserId, tellen opportunities per persoon niet goed.",
      "Als observedConversationAssignees leeg of anders is, komen calls waarschijnlijk niet via conversations assignedTo binnen.",
      "Als voiceCallLogs leeg is, zijn transcripties/call logs niet beschikbaar via Voice AI of mist de scope voice-ai-dashboard.readonly.",
      "Als calendars niet counted zijn, moet de calendarnaam exact worden toegevoegd aan COUNTED_CALENDARS."
    ]
  };
}

function countBy(items, getKey) {
  return items.reduce((acc, item) => {
    const key = String(getKey(item) || "empty");
    acc[key] = (acc[key] || 0) + 1;
    return acc;
  }, {});
}

function sampleOpportunity(item) {
  return {
    id: item.id,
    contactId: contactId(item),
    name: item.name,
    pipelineId: item.pipelineId,
    pipelineStageId: stageId(item),
    assignedTo: assignedTo(item),
    status: item.status,
    createdAt: item.createdAt || item.dateAdded || item.created_at,
    updatedAt: item.updatedAt || item.dateUpdated,
    lastStageChangeAt: item.lastStageChangeAt,
    lastStatusChangeAt: item.lastStatusChangeAt
  };
}

function sampleConversation(item) {
  return {
    id: item.id,
    contactId: item.contactId,
    assignedTo: assignedConversation(item),
    lastMessageType: item.lastMessageType,
    type: item.type,
    lastMessageDirection: item.lastMessageDirection,
    lastMessageDate: item.lastMessageDate,
    updatedAt: item.updatedAt || item.dateUpdated,
    hasBody: Boolean(item.lastMessageBody)
  };
}

function sampleCalendarEvent(event) {
  return {
    id: event.id,
    title: event.title,
    calendarId: event.calendarId,
    assignedUserId: event.assignedUserId,
    users: event.users,
    appointmentStatus: event.appointmentStatus,
    startTime: event.startTime,
    endTime: event.endTime
  };
}

function sampleVoiceCallLog(log) {
  return {
    id: log.id,
    contactId: log.contactId,
    agentId: log.agentId,
    createdAt: log.createdAt,
    duration: log.duration,
    hasTranscript: Boolean(log.transcript),
    hasSummary: Boolean(log.summary),
    actionTypes: (log.executedCallActions || []).map((action) => action.actionType)
  };
}

function scoreTranscript(call) {
  const text = call.transcript.toLowerCase();
  const positives = ["volgende stap", "afspraak", "bingo", "concreet", "budget", "probleem"];
  const gaps = ["misschien", "geen tijd", "twijfel", "later", "prijs"];
  const score = Math.max(58, Math.min(96, 72 + positives.filter((word) => text.includes(word)).length * 5 - gaps.filter((word) => text.includes(word)).length * 3));
  return {
    total: score,
    wentWell: [
      "De opening was duidelijk en rustig.",
      "De lead kreeg genoeg ruimte om het probleem uit te leggen.",
      call.result === "Bingo" ? "De setter stuurde goed naar een concrete Bingo." : "De setter hield het gesprek netjes gestructureerd."
    ],
    couldImprove: [
      "Maak de pijn en urgentie eerder concreet.",
      "Vat vaker samen voordat je naar de volgende vraag gaat.",
      "Eindig met een scherpere next step en check commitment."
    ],
    missedMoment: call.result === "Nope not today" ? "De lead gaf twijfel aan; hier had een korte herformulering van waarde kunnen helpen." : "Er was ruimte om de beslissingscriteria iets dieper uit te vragen."
  };
}

function demoData() {
  const setterMembers = users.filter((user) => user.role === "setter");
  const closerMembers = users.filter((user) => user.role === "closer");
  const demoSetters = setterMembers.map((member, index) => {
    const bingos = [8, 7, 6, 5, 5][index] || 4;
    const callsWeek = [248, 231, 219, 204, 198][index] || 160;
    const answeredCalls = [78, 72, 67, 61, 58][index] || 45;
    const loginHours = [21.5, 20, 19.5, 18, 17.5][index] || 16;
    return {
      id: member.id,
      ghlUserId: member.ghlUserId,
      name: member.name,
      role: member.role,
      loginHours,
      callsToday: [51, 45, 42, 38, 35][index] || 30,
      callsWeek,
      answeredCalls,
      noShows: [2, 3, 3, 4, 2][index] || 2,
      bingos,
      callsPerBingo: Number((callsWeek / Math.max(1, bingos)).toFixed(1)),
      conversationsPerBingo: Number((answeredCalls / Math.max(1, bingos)).toFixed(1)),
      bingosPerHour: Number((bingos / Math.max(1, loginHours)).toFixed(2)),
      nopePerBingo: Number(([0.5, 0.7, 0.8, 0.6, 0.4][index] || 0.5).toFixed(2))
    };
  });
  const demoClosers = closerMembers.map((member, index) => ({
    id: member.id,
    ghlUserId: member.ghlUserId,
    name: member.name,
    role: member.role,
    loginHours: [18, 17.5][index] || 16,
    showed: [16, 14][index] || 0,
    meetings: [18, 15][index] || 0,
    won: [7, 5][index] || 0,
    lost: [4, 5][index] || 0,
    avgDaysToClose: [5.8, 7.2][index] || 0,
    closeRate: [38.9, 33.3][index] || 0
  }));
  const setterByIndex = (index) => demoSetters[index] || demoSetters[0] || { id: "unknown", name: "Setter" };
  const closerByIndex = (index) => demoClosers[index] || { id: "", name: "" };
  const total = (key) => demoSetters.reduce((sum, item) => sum + Number(item[key] || 0), 0);
  const totalBingos = total("bingos");
  const totalCallsWeek = total("callsWeek");
  const totalAnswered = total("answeredCalls");
  const totalLoginHours = total("loginHours");
  return {
    rawSync: { mode: "demo", opportunities: 24, conversations: 18, syncedAt: new Date().toISOString() },
    stageConfig: { setter: SETTER_STAGES, closer: CLOSER_STAGES, countedCalendars: COUNTED_CALENDARS },
    opportunityStageTotals: { readyToCall: 38, called: 91, followUp: 27, nopeNotToday: 14, bingo: totalBingos },
    closerStageTotals: { discoveryCall: 18, followUpCall: 9, noShow: 7, proposalSent: 6, dealClosed: 5, dealLost: 4, future: 3 },
    totals: {
      loginHours: Number(totalLoginHours.toFixed(1)),
      callsToday: total("callsToday"),
      callsWeek: totalCallsWeek,
      answeredCalls: totalAnswered,
      noShows: total("noShows"),
      bingos: totalBingos,
      callsPerBingo: Number((totalCallsWeek / Math.max(1, totalBingos)).toFixed(1)),
      conversationsPerBingo: Number((totalAnswered / Math.max(1, totalBingos)).toFixed(1)),
      bingosPerHour: Number((totalBingos / Math.max(1, totalLoginHours)).toFixed(2)),
      nopePerBingo: Number((demoSetters.reduce((sum, item) => sum + item.nopePerBingo, 0) / Math.max(1, demoSetters.length)).toFixed(2))
    },
    setters: demoSetters,
    closers: demoClosers,
    calls: [
      { id: "call-1001", ownerId: setterByIndex(0).id, closerId: closerByIndex(0).id, owner: setterByIndex(0).name, contact: "Jasper van Dijk", date: "2026-06-08", duration: "12:48", answered: true, result: "Bingo", score: 86, transcript: "Setter: Hoi Jasper, ik bel kort over je aanvraag. Lead: Ik wil vooral minder handmatig opvolgen. Setter: Helder, dus het probleem zit in snelheid en opvolging. Lead: Ja, precies. Setter: Dan is een volgende stap logisch: een afspraak met onze specialist om te kijken welke pipeline nu lekt." },
      { id: "call-1002", ownerId: setterByIndex(1).id, closerId: closerByIndex(0).id, owner: setterByIndex(1).name, contact: "Linda Meijer", date: "2026-06-08", duration: "08:21", answered: true, result: "Follow up", score: 74, transcript: "Setter: Wat maakt dat je nu kijkt naar automatisering? Lead: We missen overzicht. Setter: Dan wil ik je later vandaag nog even terugpakken met twee concrete opties." },
      { id: "call-1003", ownerId: setterByIndex(2).id, closerId: closerByIndex(1).id, owner: setterByIndex(2).name, contact: "Ramon Peters", date: "2026-06-07", duration: "06:04", answered: true, result: "Nope not today", score: 68, transcript: "Setter: Past het om morgen te kijken? Lead: Misschien, maar ik heb geen tijd. Setter: Begrijpelijk, ik stuur nog wat info na." },
      { id: "call-1004", ownerId: setterByIndex(3).id, closerId: closerByIndex(1).id, owner: setterByIndex(3).name, contact: "Eva Bos", date: "2026-06-07", duration: "14:11", answered: true, result: "Bingo", score: 91, transcript: "Setter: Als ik je goed begrijp kost opvolging jullie deals. Lead: Ja, dat is het probleem. Setter: Dan plan ik een Bingo met onze closer, zodat jullie exact zien wat er anders moet." }
    ],
    team: users.map(publicUser)
  };
}

function publicUser(user) {
  return { id: user.id, ghlUserId: user.ghlUserId, name: user.name, role: user.role, email: user.email };
}

function fallbackPassword(member) {
  if (process.env.NODE_ENV === "production") return crypto.randomBytes(24).toString("hex");
  if (member.role === "admin") return "autopilot";
  return "welkom";
}

function authUser(req) {
  const sid = cookie(req, "ap_sales_sid");
  const session = sid && sessions.get(sid);
  if (!session) return null;
  return users.find((user) => user.id === session.userId) || null;
}

function cookie(req, name) {
  const raw = req.headers.cookie || "";
  const item = raw.split(";").map((part) => part.trim()).find((part) => part.startsWith(`${name}=`));
  return item ? decodeURIComponent(item.split("=").slice(1).join("=")) : "";
}

function sessionCookie(value) {
  const sameSite = process.env.NODE_ENV === "production" ? "SameSite=None; Secure" : "SameSite=Lax";
  return `${value}; HttpOnly; ${sameSite}; Path=/`;
}

async function bodyJson(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  if (!chunks.length) return {};
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

function staticFile(req, res) {
  const urlPath = req.url === "/" ? "/index.html" : decodeURIComponent(req.url.split("?")[0]);
  const target = path.normalize(path.join(PUBLIC, urlPath));
  if (!target.startsWith(PUBLIC)) return json(res, 403, { error: "Verboden." });
  if (!fs.existsSync(target)) return json(res, 404, { error: "Niet gevonden." });
  const ext = path.extname(target).toLowerCase();
  const types = { ".html": "text/html", ".css": "text/css", ".js": "application/javascript", ".svg": "image/svg+xml" };
  res.writeHead(200, { "Content-Type": types[ext] || "application/octet-stream" });
  fs.createReadStream(target).pipe(res);
}

function json(res, status, payload) {
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(JSON.stringify(payload));
}
