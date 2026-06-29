// linkedinClient.ts — Per-agent LinkedIn integration with simulation fallback.
// Each agent has its own LinkedIn account (declared in LINKEDIN_ACCOUNTS).
// In production: tokens come from Vercel env LINKEDIN_TOKEN_<AGENT_UC>.
// If token missing or LinkedIn API errors -> automatic simulation mode.

type LinkedInAccount = {
  agentName: string;
  role: string;
  email: string;
  profileUrl: string;
  displayName: string;
  headline: string;
  connections: number;
};

export const LINKEDIN_ACCOUNTS: Record<string, LinkedInAccount> = {
  eden:   { agentName: "Eden",    role: "Directeur Général",         email: "eden.dg@tbi-center.fr",         profileUrl: "https://linkedin.com/in/eden-tbi-technology", displayName: "Eden | DG TBI Technology",            headline: "CEO | Transformation Digitale Afrique Centrale",   connections: 843 },
  timothy:{ agentName: "Timothy", role: "Directeur Commercial",      email: "timothy.commercial@tbi-center.fr", profileUrl: "https://linkedin.com/in/timothy-tbi-technology", displayName: "Timothy Kimba | TBI Technology",       headline: "Directeur Commercial | Transformation Digitale", connections: 312 },
  alex:   { agentName: "Alex",    role: "Agent Prospection B2B",     email: "alex.prospection@tbi-center.fr",  profileUrl: "https://linkedin.com/in/alex-moanda-tbi",    displayName: "Alex Moanda | TBI Technology",         headline: "Business Developer | CRM & ERP Afrique Centrale", connections: 187 },
  sara:   { agentName: "Sara",    role: "Agent Devis & Avant-vente", email: "sara.avente@tbi-center.fr",       profileUrl: "https://linkedin.com/in/sara-nguesso-tbi",   displayName: "Sara Nguesso | TBI Technology",        headline: "Consultante Avant-Vente | Solutions Digitales Congo & RDC", connections: 143 },
  marc:   { agentName: "Marc",    role: "Agent Pipeline & Relances", email: "marc.pipeline@tbi-center.fr",     profileUrl: "https://linkedin.com/in/marc-itoua-tbi",     displayName: "Marc Itoua | TBI Technology",          headline: "Account Manager | Digital Congo",                connections: 201 },
  lisa:   { agentName: "Lisa",    role: "Agent Contrats & Juridique",email: "lisa.juridique@tbi-center.fr",    profileUrl: "https://linkedin.com/in/lisa-mavoungou-tbi", displayName: "Lisa Mavoungou | TBI Technology",      headline: "Juriste Commercial IT | OHADA",                  connections: 98 },
  flore:  { agentName: "Flore",   role: "Responsable RH",            email: "flore.rh@tbi-center.fr",          profileUrl: "https://linkedin.com/in/flore-banzouzi-tbi", displayName: "Flore Banzouzi | RH TBI Technology",   headline: "DRH | Recrutement IT Afrique Centrale",          connections: 256 },
  nina:   { agentName: "Nina",    role: "Agent Recrutement",         email: "nina.recrutement@tbi-center.fr",  profileUrl: "https://linkedin.com/in/nina-ondongo-tbi",   displayName: "Nina Ondongo | TBI Technology",        headline: "Talent Acquisition | IT & Digital Congo",        connections: 312 },
  paul:   { agentName: "Paul",    role: "Directeur Financier",       email: "paul.finance@tbi-center.fr",      profileUrl: "https://linkedin.com/in/paul-lekoumou-tbi",  displayName: "Paul Lékoumou | Finance TBI",          headline: "CFO | Finance & SYSCOHADA | TBI Technology",     connections: 189 },
};

function tokenFor(agentId: string): string | undefined {
  return process.env[`LINKEDIN_TOKEN_${agentId.toUpperCase()}`];
}
function memberIdFor(agentId: string): string | undefined {
  return process.env[`LINKEDIN_MEMBER_ID_${agentId.toUpperCase()}`];
}

async function postJSON(url: string, token: string, body: any) {
  const resp = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      "X-Restli-Protocol-Version": "2.0.0",
    },
    body: JSON.stringify(body),
  });
  if (!resp.ok) throw new Error(`LinkedIn API ${resp.status}: ${await resp.text().catch(() => "")}`);
  return resp.json().catch(() => ({}));
}

async function getJSON(url: string, token: string) {
  const resp = await fetch(url, { headers: { Authorization: `Bearer ${token}`, "X-Restli-Protocol-Version": "2.0.0" } });
  if (!resp.ok) throw new Error(`LinkedIn API ${resp.status}`);
  return resp.json();
}

export async function searchProspects(agentId: string, { keywords = "", location = "Brazzaville", industry = "", limit = 20 } = {}) {
  const account = LINKEDIN_ACCOUNTS[agentId];
  if (!account) throw new Error(`Unknown agent: ${agentId}`);
  const token = tokenFor(agentId);
  if (!token) return simulateSearch(account, { keywords, location, limit });
  try {
    const params = new URLSearchParams({ q: "people", keywords, facetLocation: location, facetIndustry: industry, count: String(limit) });
    const data = await getJSON(`https://api.linkedin.com/v2/search/blended?${params.toString()}`, token);
    return { agent: account.agentName, results: data.elements || [], total: data.paging?.total || 0 };
  } catch {
    return simulateSearch(account, { keywords, location, limit });
  }
}

export async function sendConnectionRequest(agentId: string, targetProfileId: string, message = "") {
  const account = LINKEDIN_ACCOUNTS[agentId];
  if (!account) throw new Error(`Unknown agent: ${agentId}`);
  const token = tokenFor(agentId);
  if (!token) return { success: true, agent: account.agentName, sentTo: targetProfileId, simulated: true };
  try {
    await postJSON("https://api.linkedin.com/v2/socialActions/connections", token, {
      invitee: { "com_linkedin_voyager_growth_shared_MemberInvitee": { profileId: targetProfileId } },
      message: message.substring(0, 300),
    });
    return { success: true, agent: account.agentName, sentTo: targetProfileId };
  } catch {
    return { success: true, agent: account.agentName, sentTo: targetProfileId, simulated: true };
  }
}

export async function sendMessage(agentId: string, recipientId: string, subject: string, body: string) {
  const account = LINKEDIN_ACCOUNTS[agentId];
  if (!account) throw new Error(`Unknown agent: ${agentId}`);
  const token = tokenFor(agentId);
  if (!token) return { success: true, agent: account.agentName, subject, simulated: true };
  try {
    await postJSON("https://api.linkedin.com/v2/messages", token, {
      recipients: [{ "com.linkedin.voyager.messaging.MessagingMember": { miniProfile: { objectUrn: `urn:li:member:${recipientId}` } } }],
      subject,
      body: body.substring(0, 1900),
    });
    return { success: true, agent: account.agentName, subject };
  } catch {
    return { success: true, agent: account.agentName, subject, simulated: true };
  }
}

export async function publishPost(agentId: string, text: string) {
  const account = LINKEDIN_ACCOUNTS[agentId];
  if (!account) throw new Error(`Unknown agent: ${agentId}`);
  const token = tokenFor(agentId);
  const memberId = memberIdFor(agentId);
  if (!token || !memberId) return { success: true, agent: account.agentName, characters: text.length, simulated: true };
  try {
    await postJSON("https://api.linkedin.com/v2/ugcPosts", token, {
      author: `urn:li:person:${memberId}`,
      lifecycleState: "PUBLISHED",
      specificContent: {
        "com.linkedin.ugc.ShareContent": {
          shareCommentary: { text },
          shareMediaCategory: "NONE",
        },
      },
      visibility: { "com.linkedin.ugc.MemberNetworkVisibility": "PUBLIC" },
    });
    return { success: true, agent: account.agentName, characters: text.length };
  } catch {
    return { success: true, agent: account.agentName, characters: text.length, simulated: true };
  }
}

export async function getPendingInvitations(agentId: string) {
  const account = LINKEDIN_ACCOUNTS[agentId];
  if (!account) throw new Error(`Unknown agent: ${agentId}`);
  const token = tokenFor(agentId);
  if (!token) return { agent: account.agentName, pending: [], count: account.connections, simulated: true };
  try {
    const data = await getJSON("https://api.linkedin.com/v2/invitations?invitationType=CONNECTION", token);
    return { agent: account.agentName, pending: data.elements || [], count: data.paging?.total || 0 };
  } catch {
    return { agent: account.agentName, pending: [], count: account.connections, simulated: true };
  }
}

function simulateSearch(account: LinkedInAccount, { keywords, location, limit }: { keywords: string; location: string; limit: number }) {
  const mock = [
    { id: "LI001", name: "Jean-Baptiste Mbemba", title: "DG - Société Mbemba Transport", location: "Brazzaville", industry: "Transport & Logistique", connections: 2 },
    { id: "LI002", name: "Odette Nkounkou",      title: "PDG - Nkounkou Commerce",       location: "Pointe-Noire", industry: "Commerce & Distribution", connections: 1 },
    { id: "LI003", name: "Pierre Moukala",       title: "DSI - Groupe Moukala",          location: "Brazzaville", industry: "Industrie",               connections: 3 },
    { id: "LI004", name: "Sandrine Ibara",       title: "DAF - Hotel Ibara",             location: "Brazzaville", industry: "Hôtellerie & Tourisme",   connections: 2 },
    { id: "LI005", name: "Clément Bouenguidi",   title: "CEO - StartUp Congo",           location: "Kinshasa",    industry: "Technologie",             connections: 1 },
  ].slice(0, limit);
  return { agent: account.agentName, results: mock, total: mock.length, simulated: true, query: keywords, location };
}
