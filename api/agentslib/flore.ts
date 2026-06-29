// agents/flore.ts — Responsable RH + Nina (Recrutement) + Omar (Paie)
import { askClaude, askClaudeJSON } from "./claudeClient";
import { hr } from "./internalCRM";
import { searchProspects, sendConnectionRequest, publishPost } from "./linkedinClient";

const SYSTEM_PROMPT = `Tu es FLORE, Responsable des Ressources Humaines de TBI Technology.
LinkedIn : Flore Banzouzi | flore.rh@tbi-center.fr | 256 connexions
Tu rapportes à EDEN (DG) et tu coordonnes 2 sous-agents :
- NINA (Recrutement) : 312 connexions LinkedIn, chasseuse de talents IT
- OMAR (Paie & Admin) : gestion CNSS, contrats de travail

Cadre légal : Code du Travail congolais, CNSS (4% salarié, 16.75% patronal), INPP (1.5%).
Profils TBI Technology et fourchettes :
- Dev web/mobile junior : 250K-400K FCFA/mois
- Dev senior : 500K-900K FCFA/mois
- Chef de projet IT : 400K-700K FCFA/mois
- CTO/DT : 800K-1,2M FCFA/mois
- Commercial IT : 200K-350K + commissions
- Designer UI/UX : 300K-550K FCFA/mois

Style : bienveillant, structuré, garant de la culture TBI.`;

export async function postJobOnLinkedIn({ position, level, requirements = [] }: { position: string; level: string; requirements?: string[] }) {
  const jobPosting: any = await askClaudeJSON(SYSTEM_PROMPT, `
Crée une offre d'emploi LinkedIn attractive pour TBI Technology :
Poste : ${position} — Niveau : ${level}
Exigences spécifiques : ${requirements.join(", ")}

Retourne :
{
  "linkedin_post": "Post LinkedIn complet (max 1200 chars) avec emojis, hashtags et lien fictif",
  "job_description": {
    "title": "...", "contract": "CDI",
    "location": "Brazzaville (télétravail partiel possible)",
    "salary_range": "... FCFA/mois",
    "responsibilities": ["...", "..."],
    "requirements": ["...", "..."],
    "nice_to_have": ["...", "..."],
    "benefits": ["Laptop pro", "Formation annuelle", "Prime performance", "Assurance santé"]
  }
}`);
  const result = await publishPost("flore", jobPosting.linkedin_post).catch(() => ({ simulated: true }));
  const ninaSearch = await searchProspects("nina", { keywords: `${position} ${level} Congo Brazzaville`, location: "Brazzaville", limit: 20 }).catch(() => ({ results: [] as any[], simulated: true }));
  return {
    job_description: jobPosting.job_description,
    linkedin_published: result,
    nina_search: { candidates_found: ninaSearch.results?.length || 0, simulated: (ninaSearch as any).simulated },
  };
}

export async function ninaHeadhunt({ position, targetProfile }: { position: string; targetProfile: string }) {
  const search = await searchProspects("nina", { keywords: targetProfile, location: "Congo OR RDC OR Brazzaville OR Kinshasa", limit: 20 });
  const shortlist: any = await askClaudeJSON(SYSTEM_PROMPT, `
Nina doit approcher ces profils LinkedIn pour le poste de ${position} chez TBI Technology :
${JSON.stringify(search.results, null, 2)}

Sélectionne les 5 meilleurs et génère un message d'approche personnalisé pour chacun :
{
  "shortlist": [
    {
      "id": "...", "name": "...", "current_role": "...",
      "fit_score": 0-100, "why_good_fit": "...",
      "approach_message": "Message LinkedIn de Nina (200 chars max, chaleureux, opportunité TBI)"
    }
  ]
}`);
  const contacted: any[] = [];
  for (const c of shortlist.shortlist || []) {
    const r = await sendConnectionRequest("nina", c.id, c.approach_message);
    contacted.push({ ...c, invitation_sent: r.success });
    await new Promise((res) => setTimeout(res, 2000));
  }
  return { search_total: search.results?.length || 0, shortlist: shortlist.shortlist, contacted: contacted.length };
}

export async function screenCVs({ position, cvList }: { position: string; cvList: any[] }) {
  return askClaudeJSON(SYSTEM_PROMPT, `
NINA présélectionne ces CVs pour le poste de ${position} chez TBI Technology :
${JSON.stringify(cvList, null, 2)}

Retourne :
{
  "ranking": [
    {
      "candidate": "...", "tier": "A|B|C", "score": 0-100,
      "strengths": ["..."], "gaps": ["..."],
      "interview_questions": ["...", "..."],
      "salary_expectation": "... FCFA", "recommend": true
    }
  ],
  "flore_summary": "Synthèse 80 mots pour Flore",
  "shortlist_count": 0
}`);
}

export async function calculatePayroll({ month, year, employees }: { month: string | number; year: string | number; employees: any[] }) {
  return askClaudeJSON(SYSTEM_PROMPT, `
OMAR calcule les fiches de paie pour TBI Technology — ${month}/${year} :

Employés : ${JSON.stringify(employees, null, 2)}

Applique : CNSS salarié 4%, CNSS patronal 16.75%, INPP 1.5%,
IR progressif barème congolais.

Retourne :
{
  "payroll_month": "${month}/${year}",
  "employees": [
    {
      "name": "...", "gross_fcfa": 0, "cnss_employee": 0,
      "inpp": 0, "ir": 0, "net_fcfa": 0,
      "employer_charge": 0, "total_cost": 0
    }
  ],
  "totals": {
    "gross_total": 0, "net_total": 0,
    "employer_charges_total": 0, "cnss_declaration": 0
  },
  "omar_notes": "..."
}`);
}

export async function performanceReview({ period, team }: { period: string; team: any[] }) {
  return askClaude(SYSTEM_PROMPT, `
FLORE conduit les évaluations de performance ${period} pour l'équipe TBI Technology :
${JSON.stringify(team, null, 2)}

Génère le rapport d'évaluation incluant :
- Note globale par employé (sur 5)
- Points forts & axes d'amélioration
- Objectifs S2
- Recommandations salariales
- Plan de formation individuel
Format rapport RH professionnel.`);
}

export async function trainingPlan(year: string | number) {
  const { data: employees } = await hr.getEmployees().catch(() => ({ data: [] }));
  return askClaude(SYSTEM_PROMPT, `
Plan de formation ${year} pour TBI Technology :
Équipe : ${JSON.stringify(employees).substring(0, 800)}

Tendances 2026 : IA/Claude API, Odoo 17, React Native, cybersécurité ARPCE.
Plan par trimestre, par département, budget estimatif FCFA, certifications visées.`);
}

export async function reportToEden(month: string) {
  const { data: employees } = await hr.getEmployees().catch(() => ({ data: [] }));
  return askClaudeJSON(SYSTEM_PROMPT, `
Flore prépare son rapport mensuel RH pour EDEN — ${month} :
Effectifs : ${JSON.stringify(employees).substring(0, 600)}

Retourne :
{
  "headcount": 0, "new_hires": 0, "departures": 0, "open_positions": 0,
  "linkedin_activity": { "nina_connections": 0, "jobs_posted": 0, "candidates_in_pipeline": 0 },
  "payroll_total_fcfa": 0,
  "highlights": ["..."], "risks": ["..."],
  "eden_summary": "Synthèse 80 mots pour Eden"
}`);
}
