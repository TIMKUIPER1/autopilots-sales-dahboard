const SETTER_STAGES = {
  readyToCall: "31510e27-8f46-4685-8f75-cb8b8fbbd460",
  called: "320d52f3-7cb7-4ac6-b753-7374d84d5ee9",
  followUp: "29f30adc-3e93-40b3-a351-bd93585b55ef",
  nopeNotToday: "da8517a6-838b-4eff-9b93-4f28182a6ea9",
  bingo: "05f70c13-6ace-4c44-9dc3-fb6c4c5f0102"
};

const CLOSER_STAGES = {
  discoveryCall: "896cfaca-8c34-4dc0-b022-f6022ee155b2",
  followUpCall: "cfb8bf82-2a47-43b4-933d-fdcbed5479e0",
  noShow: "f55bdfa0-bb2e-4ede-b3d7-4a769dadb880",
  proposalSent: "7bf5bfad-dcb6-4b2a-9f77-5a85fdfe94e8",
  dealClosed: "a91cae3c-4b2a-4a6a-91f9-cfae7302fcc9",
  dealLost: "f382217e-4add-4c92-8ec8-c05b6c9fd00e",
  future: "5ec8d9ed-c62c-4c2b-ab39-d5788e58182a"
};

const COUNTED_CALENDARS = [
  "Vervolgafspraak Autopilots Ai Agency",
  "Kennismaking met Autopilots - Ai Agents op maat",
  "(Website) Kennismaking met Autopilots - Ai Agents op maat",
  "Discovery Call - Autopilots 🇺🇸",
  "Follow up - Autopilots Ai Agency"
];

const TEAM = [
  {
    id: "admin",
    ghlUserId: "",
    name: "Management",
    email: "admin@autopilots.nl",
    role: "admin",
    passwordEnv: "ADMIN_PASSWORD"
  },
  {
    id: "setter-b3Dz7ucWrOiwzcoINtbt",
    ghlUserId: "b3Dz7ucWrOiwzcoINtbt",
    name: "Albert Verlinden",
    email: "albert.verlinden@gmail.com",
    role: "setter",
    passwordEnv: "ALBERT_PASSWORD"
  },
  {
    id: "setter-LP04fSx5lETxcdjCUTfP",
    ghlUserId: "LP04fSx5lETxcdjCUTfP",
    name: "Jean Paul Blommaert",
    email: "jeanpaulblommaert@gmail.com",
    role: "setter",
    passwordEnv: "JEAN_PAUL_PASSWORD"
  },
  {
    id: "setter-Wk3S3kfbfVd6ENEy21Vu",
    ghlUserId: "Wk3S3kfbfVd6ENEy21Vu",
    name: "Kaan Karademir",
    email: "m.kaan.karademir@outlook.com",
    role: "setter",
    passwordEnv: "KAAN_PASSWORD"
  },
  {
    id: "setter-kVqvGdn8mK5j1PN3Xx2K",
    ghlUserId: "kVqvGdn8mK5j1PN3Xx2K",
    name: "Nico van Haelen",
    email: "nico@vanhaelen.be",
    role: "setter",
    passwordEnv: "NICO_PASSWORD"
  },
  {
    id: "setter-hMiGJ12BhHJo4fHMyual",
    ghlUserId: "hMiGJ12BhHJo4fHMyual",
    name: "Fabian Springer",
    email: "fgaspringer@gmail.com",
    role: "setter",
    passwordEnv: "FABIAN_PASSWORD"
  },
  {
    id: "closer-qMm2MKaYYZzuvdoEHxHM",
    ghlUserId: "qMm2MKaYYZzuvdoEHxHM",
    name: "Tim Kuiper",
    email: "tim@auto-pilots.io",
    role: "closer",
    passwordEnv: "TIM_PASSWORD"
  }
];

module.exports = {
  CLOSER_STAGES,
  COUNTED_CALENDARS,
  SETTER_STAGES,
  TEAM
};
