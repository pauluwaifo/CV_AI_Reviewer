import type {
  AnalysisResult,
  CandidateProfile,
  DocumentType,
  EvidencePoint,
  ExtractedFact,
  HiringRecommendation,
  RiskSignal,
  RoleCriterionMatch,
  RoleSetup,
  ScoreBreakdownItem,
  SkillAssessment,
} from "@/types/document-intelligence";

type ResolvedDocumentType = AnalysisResult["documentType"];

type SectionSignals = {
  hasConclusion: boolean;
  hasConfidentiality: boolean;
  hasContactDetails: boolean;
  hasDueDate: boolean;
  hasEducation: boolean;
  hasEffectiveDate: boolean;
  hasExecutiveSummary: boolean;
  hasExperience: boolean;
  hasFindings: boolean;
  hasGoverningLaw: boolean;
  hasInvoiceNumber: boolean;
  hasLiability: boolean;
  hasMethodology: boolean;
  hasPaymentTerms: boolean;
  hasRecommendations: boolean;
  hasSignature: boolean;
  hasSkills: boolean;
  hasTax: boolean;
  hasTermination: boolean;
  hasTotalAmount: boolean;
  hasVendorDetails: boolean;
  hasQuantifiedEvidence: boolean;
};

type ResumeSignalHit = {
  label: string;
  evidence: string;
  strength: "matched" | "partial";
};

type ResumeScreenSignals = {
  achievementLines: string[];
  explicitYears: number | null;
  futureDateLines: string[];
  matchedCriteria: ResumeSignalHit[];
  recentRoleLines: string[];
  topLines: string[];
};

const roleSkillCatalog = [
  "react",
  "next.js",
  "typescript",
  "javascript",
  "node.js",
  "python",
  "java",
  "sql",
  "postgresql",
  "mysql",
  "mongodb",
  "aws",
  "azure",
  "gcp",
  "docker",
  "kubernetes",
  "linux",
  "windows",
  "network",
  "troubleshooting",
  "customer support",
  "communication",
  "excel",
  "power bi",
  "figma",
  "ui",
  "ux",
  "product design",
  "project management",
  "data analysis",
] as const;

const roleSkillAliases: Record<string, string[]> = {
  react: ["react", "react.js"],
  "next.js": ["next.js", "nextjs"],
  typescript: ["typescript", "ts"],
  javascript: ["javascript", "js", "ecmascript"],
  "node.js": ["node.js", "nodejs", "node", "express"],
  sql: ["sql", "postgres", "mysql", "query"],
  postgresql: ["postgresql", "postgres", "psql"],
  mysql: ["mysql"],
  mongodb: ["mongodb", "mongo"],
  aws: ["aws", "amazon web services"],
  azure: ["azure"],
  gcp: ["gcp", "google cloud"],
  docker: ["docker", "container"],
  kubernetes: ["kubernetes", "k8s"],
  linux: ["linux", "ubuntu", "bash", "shell"],
  windows: ["windows", "active directory", "microsoft 365"],
  network: ["network", "networking", "lan", "wan", "tcp/ip"],
  troubleshooting: ["troubleshooting", "diagnosis", "incident resolution", "root cause"],
  "customer support": ["customer support", "customer service", "client support", "help desk"],
  communication: ["communication", "stakeholder", "customer-facing", "presentation"],
  excel: ["excel", "spreadsheets"],
  "power bi": ["power bi", "powerbi"],
  figma: ["figma"],
  ui: ["ui", "user interface"],
  ux: ["ux", "user experience"],
  "product design": ["product design", "design systems", "wireframing"],
  "project management": ["project management", "agile", "scrum", "kanban"],
  "data analysis": ["data analysis", "analytics", "reporting", "dashboards"],
};

export function buildLocalAnalysis({
  text,
  documentType,
  analysisGoal,
  pageCount,
  roleSetup,
}: {
  text: string;
  documentType: DocumentType;
  analysisGoal?: string;
  pageCount: number;
  roleSetup?: RoleSetup;
}): AnalysisResult {
  const resolvedType = inferDocumentType(text, documentType);
  const facts = extractFacts(text, resolvedType);
  const sections = detectSections(text);
  const resumeSignals =
    resolvedType === "cv"
      ? analyzeResumeSignals(text, analysisGoal, roleSetup, facts)
      : null;
  const redFlags = buildRedFlags(text, resolvedType, sections, facts, resumeSignals);
  const highlights = buildHighlights(
    text,
    resolvedType,
    sections,
    facts,
    pageCount,
    resumeSignals
  );
  const recommendedActions = buildRecommendedActions(
    resolvedType,
    redFlags,
    sections,
    analysisGoal,
    roleSetup
  );
  const roleMatch = buildRoleMatch(
    text,
    resolvedType,
    sections,
    facts,
    analysisGoal,
    roleSetup,
    resumeSignals
  );
  const skillAssessments = buildSkillAssessments(roleMatch.criteria, roleSetup);
  const riskSignals = buildRiskSignals(redFlags, roleMatch.criteria);
  const evidencePoints = buildEvidencePoints(
    text,
    resolvedType,
    highlights,
    redFlags,
    roleMatch.criteria,
    facts,
    resumeSignals
  );
  const interviewQuestions = buildInterviewQuestions(
    resolvedType,
    roleMatch.criteria,
    redFlags,
    analysisGoal
  );
  const breakdown = buildScoreBreakdown(
    text,
    resolvedType,
    sections,
    facts,
    redFlags,
    roleMatch.criteria,
    resumeSignals
  );
  const scoreValue = Math.round(
    breakdown.reduce((sum, item) => sum + item.score, 0) / breakdown.length
  );

  return {
    documentType: resolvedType,
    summary: buildSummary({
      text,
      resolvedType,
      pageCount,
      highlights,
      redFlags,
      analysisGoal,
    }),
    recommendation: buildRecommendation(scoreValue, redFlags, roleMatch.criteria),
    candidateProfile: buildCandidateProfile(text, facts, resumeSignals),
    roleMatch,
    skillAssessments,
    riskSignals,
    keyHighlights: highlights.slice(0, 6),
    redFlags: redFlags.slice(0, 5),
    recommendedActions: recommendedActions.slice(0, 4),
    evidencePoints: evidencePoints.slice(0, 6),
    interviewQuestions: interviewQuestions.slice(0, 6),
    score: {
      value: scoreValue,
      label: scoreLabelFromValue(scoreValue),
      rationale: buildScoreRationale(resolvedType, breakdown, redFlags),
      breakdown,
    },
    extractedFacts: facts.slice(0, 8),
    tone: scoreValue >= 80 ? "Confident" : scoreValue >= 62 ? "Balanced" : "Cautious",
  };
}

function inferDocumentType(
  text: string,
  requestedDocumentType: DocumentType
): ResolvedDocumentType {
  if (requestedDocumentType !== "auto") {
    return requestedDocumentType;
  }

  const lowerText = text.toLowerCase();
  const scores: Array<{ score: number; type: ResolvedDocumentType }> = [
    {
      type: "invoice",
      score:
        keywordScore(lowerText, [
          "invoice",
          "bill to",
          "amount due",
          "subtotal",
          "total due",
          "invoice number",
          "due date",
          "tax",
        ]) + (containsCurrency(text) ? 2 : 0),
    },
    {
      type: "contract",
      score:
        keywordScore(lowerText, [
          "agreement",
          "terms and conditions",
          "governing law",
          "termination",
          "liability",
          "indemn",
          "confidential",
          "party",
          "effective date",
        ]) + (/\bsigned\b|\bsignature\b/i.test(text) ? 1 : 0),
    },
    {
      type: "cv",
      score:
        keywordScore(lowerText, [
          "resume",
          "curriculum vitae",
          "experience",
          "employment",
          "education",
          "skills",
          "linkedin",
          "portfolio",
        ]) +
        (containsEmail(text) ? 2 : 0) +
        (containsPhone(text) ? 1 : 0),
    },
    {
      type: "report",
      score:
        keywordScore(lowerText, [
          "executive summary",
          "methodology",
          "findings",
          "analysis",
          "recommendation",
          "conclusion",
          "report",
        ]) + (countMatches(text, /\b\d+(?:\.\d+)?%/g) > 0 ? 1 : 0),
    },
  ];

  scores.sort((left, right) => right.score - left.score);
  return scores[0] && scores[0].score >= 3 ? scores[0].type : "other";
}

function detectSections(text: string): SectionSignals {
  const lowerText = text.toLowerCase();

  return {
    hasConclusion: containsAny(lowerText, [" conclusion", "\nconclusion"]),
    hasConfidentiality: containsAny(lowerText, [
      "confidential",
      "non-disclosure",
      "nda",
    ]),
    hasContactDetails: containsEmail(text) || containsPhone(text),
    hasDueDate: /due date|payment due|pay by/i.test(text),
    hasEducation: containsAny(lowerText, [
      " education",
      "\neducation",
      "academic background",
    ]),
    hasEffectiveDate: /effective date|commencement date/i.test(text),
    hasExecutiveSummary: containsAny(lowerText, [
      "executive summary",
      "\nsummary",
      "overview",
    ]),
    hasExperience: containsAny(lowerText, [
      " experience",
      "\nexperience",
      "work history",
      "employment",
    ]),
    hasFindings: containsAny(lowerText, ["findings", "results", "observations"]),
    hasGoverningLaw: /governing law|jurisdiction/i.test(text),
    hasInvoiceNumber: /invoice(?: number| no\.?| #)?[:\s]/i.test(text),
    hasLiability: /liability|indemn/i.test(text),
    hasMethodology: containsAny(lowerText, ["methodology", "approach", "framework"]),
    hasPaymentTerms: /payment terms|payment schedule|net \d+|amount due/i.test(text),
    hasRecommendations: containsAny(lowerText, [
      "recommendation",
      "next steps",
      "action items",
    ]),
    hasSignature: /signature|signed by|authorized signatory/i.test(text),
    hasSkills: containsAny(lowerText, [" skills", "\nskills", "competencies", "tools"]),
    hasTax: /\btax\b|\bvat\b|\bgst\b/i.test(text),
    hasTermination: /termination|terminate|notice period/i.test(text),
    hasTotalAmount: /amount due|grand total|total due|invoice total/i.test(text),
    hasVendorDetails: /bill to|vendor|supplier|from:/i.test(text),
    hasQuantifiedEvidence:
      containsCurrency(text) ||
      countMatches(text, /\b\d+(?:\.\d+)?%/g) > 0 ||
      /\b\d+\+?\s+(?:years|yrs)\b/i.test(text),
  };
}

function extractFacts(
  text: string,
  documentType: ResolvedDocumentType
): ExtractedFact[] {
  const facts: ExtractedFact[] = [];

  pushFact(facts, "Email", matchFirst(text, /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i));
  pushFact(
    facts,
    "Phone",
    matchFirst(
      text,
      /(?:\+\d{1,3}[\s-]?)?(?:\(?\d{2,4}\)?[\s-]?){2,4}\d{3,4}/
    )
  );
  pushFact(
    facts,
    "Website",
    matchFirst(text, /https?:\/\/\S+|www\.\S+/i)
  );
  pushFact(
    facts,
    "Date",
    matchFirst(
      text,
      /\b(?:\d{1,2}[/-]\d{1,2}[/-]\d{2,4}|(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]* \d{1,2},? \d{4})\b/i
    )
  );
  pushFact(
    facts,
    "Amount",
    matchFirst(text, /[$€£₦]\s?\d[\d,]*(?:\.\d{2})?/)
  );
  pushFact(facts, "Percentage", matchFirst(text, /\b\d+(?:\.\d+)?%/));

  if (documentType === "invoice") {
    pushFact(
      facts,
      "Invoice number",
      captureGroup(text, /invoice(?: number| no\.?| #)?[:\s]+([A-Z0-9-]+)/i)
    );
    pushFact(
      facts,
      "Due date",
      captureGroup(text, /due date[:\s]+([^\n]+)/i)
    );
    pushFact(
      facts,
      "Total due",
      captureGroup(
        text,
        /(?:amount due|grand total|total due|invoice total)[:\s]+([$€£₦]?\s?\d[\d,]*(?:\.\d{2})?)/i
      )
    );
  }

  if (documentType === "contract") {
    pushFact(
      facts,
      "Effective date",
      captureGroup(text, /effective date[:\s]+([^\n]+)/i)
    );
    pushFact(
      facts,
      "Governing law",
      captureGroup(text, /governing law[:\s]+([^\n]+)/i)
    );
  }

  if (documentType === "cv") {
    pushFact(
      facts,
      "Professional link",
      matchFirst(text, /linkedin\.com\/\S+|github\.com\/\S+|portfolio/i)
    );
    pushFact(
      facts,
      "Experience signal",
      matchFirst(text, /\b\d+\+?\s+(?:years|yrs)\b/i)
    );
  }

  if (documentType === "report") {
    pushFact(
      facts,
      "Key metric",
      matchFirst(text, /\b\d+(?:\.\d+)?%\b|[$€£₦]\s?\d[\d,]*(?:\.\d{2})?/)
    );
  }

  return facts;
}

function buildHighlights(
  text: string,
  documentType: ResolvedDocumentType,
  sections: SectionSignals,
  facts: ExtractedFact[],
  pageCount: number,
  resumeSignals: ResumeScreenSignals | null
) {
  const highlights: string[] = [];
  const wordCount = text.split(/\s+/).filter(Boolean).length;

  if (documentType === "cv") {
    highlights.push(
      `The CV contains about ${wordCount.toLocaleString()} words across ${pageCount} page${pageCount === 1 ? "" : "s"}, which is enough for a first-pass screen.`
    );
    if (sections.hasContactDetails) {
      highlights.push("Contact details are present, which supports recruiter follow-up.");
    }
    if (sections.hasExperience) {
      highlights.push("Work experience appears clearly structured in the extracted text.");
    }
    if (sections.hasSkills) {
      highlights.push("A dedicated skills or tools section supports fast shortlist review.");
    }
    if (sections.hasQuantifiedEvidence) {
      highlights.push("The CV includes measurable signals such as years of experience, percentages, or outcome metrics.");
    }
    if (resumeSignals?.matchedCriteria.length) {
      highlights.push(
        `Role-aligned evidence appears for ${resumeSignals.matchedCriteria
          .slice(0, 2)
          .map((item) => item.label)
          .join(" and ")}.`
      );
    }
    if (resumeSignals?.achievementLines[0]) {
      highlights.push(
        `A concrete evidence line stands out: "${trimEvidenceSnippet(
          resumeSignals.achievementLines[0]
        )}".`
      );
    }
  }

  if (documentType !== "cv") {
    highlights.push(
      `The document contains about ${wordCount.toLocaleString()} words across ${pageCount} page${pageCount === 1 ? "" : "s"}.`
    );
  }

  if (documentType === "contract") {
    if (sections.hasEffectiveDate) {
      highlights.push("The agreement references an effective or commencement date.");
    }
    if (sections.hasPaymentTerms) {
      highlights.push("Payment or commercial terms are stated in the document.");
    }
    if (sections.hasTermination) {
      highlights.push("Termination language is present, which helps frame exit conditions.");
    }
    if (sections.hasGoverningLaw) {
      highlights.push("Governing law language appears in the contract.");
    }
  }

  if (documentType === "invoice") {
    if (sections.hasInvoiceNumber) {
      highlights.push("An invoice identifier is present.");
    }
    if (sections.hasDueDate) {
      highlights.push("A due date appears in the billing details.");
    }
    if (sections.hasTotalAmount) {
      highlights.push("A total or amount-due field is present.");
    }
    if (sections.hasVendorDetails) {
      highlights.push("Vendor or billing-party details are included.");
    }
  }

  if (documentType === "report") {
    if (sections.hasExecutiveSummary) {
      highlights.push("The report includes a summary or overview section.");
    }
    if (sections.hasFindings) {
      highlights.push("Findings or results language appears in the main body.");
    }
    if (sections.hasRecommendations) {
      highlights.push("Recommendation-oriented language is present.");
    }
    if (sections.hasQuantifiedEvidence) {
      highlights.push("The report includes quantified evidence such as percentages or financial figures.");
    }
  }

  if (highlights.length < 3 && facts.length > 0) {
    for (const fact of facts) {
      highlights.push(`Detected a structured fact for ${fact.label.toLowerCase()}: ${fact.value}.`);
      if (highlights.length >= 4) {
        break;
      }
    }
  }

  if (highlights.length < 3) {
    highlights.push("Selectable text was successfully extracted, so the document is suitable for automated review.");
  }

  return uniqueStrings(highlights).slice(0, 6);
}

function buildRedFlags(
  text: string,
  documentType: ResolvedDocumentType,
  sections: SectionSignals,
  facts: ExtractedFact[],
  resumeSignals: ResumeScreenSignals | null
) {
  const redFlags: string[] = [];
  const wordCount = text.split(/\s+/).filter(Boolean).length;

  if (wordCount < 180) {
    redFlags.push("The extracted text is quite short, which limits confidence in the review.");
  }

  if (documentType === "cv") {
    if (!sections.hasContactDetails) {
      redFlags.push("No clear contact details were detected.");
    }
    if (!sections.hasExperience) {
      redFlags.push("The resume does not clearly show a work-experience section.");
    }
    if (!sections.hasSkills) {
      redFlags.push("A dedicated skills section was not obvious in the extracted text.");
    }
    if (!sections.hasQuantifiedEvidence) {
      redFlags.push("Few measurable achievements or metrics were detected.");
    }
    if (resumeSignals?.futureDateLines.length) {
      redFlags.push(
        `One or more resume dates appear to be in the future, starting with "${trimEvidenceSnippet(
          resumeSignals.futureDateLines[0]
        )}", and should be clarified.`
      );
    }
    if (resumeSignals && resumeSignals.achievementLines.length === 0) {
      redFlags.push(
        "The CV describes responsibilities, but there are limited concrete project or achievement lines to validate depth."
      );
    }
  }

  if (documentType === "contract") {
    if (!sections.hasEffectiveDate) {
      redFlags.push("No effective date was clearly detected.");
    }
    if (!sections.hasPaymentTerms) {
      redFlags.push("Payment or commercial terms are not clearly stated.");
    }
    if (!sections.hasTermination) {
      redFlags.push("Termination language was not obvious in the extracted text.");
    }
    if (!sections.hasLiability && !sections.hasGoverningLaw) {
      redFlags.push("Key legal-risk sections such as liability or governing law are not clearly visible.");
    }
  }

  if (documentType === "invoice") {
    if (!sections.hasInvoiceNumber) {
      redFlags.push("No invoice number was clearly detected.");
    }
    if (!sections.hasDueDate) {
      redFlags.push("A due date is missing or not clearly labeled.");
    }
    if (!sections.hasTotalAmount) {
      redFlags.push("No clear total or amount-due field was detected.");
    }
    if (!sections.hasVendorDetails) {
      redFlags.push("Vendor or billing-party details are incomplete.");
    }
  }

  if (documentType === "report") {
    if (!sections.hasFindings) {
      redFlags.push("The report does not clearly surface findings or results.");
    }
    if (!sections.hasRecommendations) {
      redFlags.push("Action-oriented recommendations are missing or weak.");
    }
    if (!sections.hasConclusion) {
      redFlags.push("A conclusion section is not clearly visible.");
    }
    if (!sections.hasQuantifiedEvidence) {
      redFlags.push("There is limited quantified evidence supporting the narrative.");
    }
  }

  if (documentType === "other") {
    if (facts.length < 2) {
      redFlags.push("Only a small number of structured facts could be extracted from the text.");
    }
    if (!containsDate(text) && !containsCurrency(text)) {
      redFlags.push("The document lacks obvious dates, amounts, or other anchor details.");
    }
  }

  if (redFlags.length === 0) {
    redFlags.push(
      documentType === "cv"
        ? "No major structural hiring issues stood out in the local CV screen."
        : "No major structural issues stood out in the local fallback review."
    );
  }

  return uniqueStrings(redFlags).slice(0, 5);
}

function buildRecommendedActions(
  documentType: ResolvedDocumentType,
  redFlags: string[],
  sections: SectionSignals,
  analysisGoal?: string,
  roleSetup?: RoleSetup
) {
  const actions: string[] = [];

  if (roleSetup?.mustHaveSkills.length) {
    actions.push(
      `Validate the must-have skills directly: ${roleSetup.mustHaveSkills.slice(0, 4).join(", ")}.`
    );
  }

  if (analysisGoal?.trim()) {
    actions.push(`Double-check the document against this requested focus: ${trimSentence(analysisGoal)}.`);
  }

  if (documentType === "cv") {
    actions.push("Compare the candidate against the must-have role criteria before shortlisting.");
    if (!sections.hasQuantifiedEvidence) {
      actions.push("Use the interview to probe measurable outcomes, ownership, and scope of work.");
    }
    if (!sections.hasContactDetails) {
      actions.push("Confirm direct contact details before moving the profile forward.");
    }
    if (!sections.hasSkills) {
      actions.push("Clarify the candidate's core tools, systems, or technical strengths in screening.");
    }
  }

  if (documentType === "contract") {
    actions.push("Review the agreement manually for missing legal protections before signing.");
    if (!sections.hasPaymentTerms) {
      actions.push("Clarify payment timing, amount, and trigger conditions.");
    }
    if (!sections.hasTermination) {
      actions.push("Add or confirm termination and notice provisions.");
    }
  }

  if (documentType === "invoice") {
    actions.push("Reconcile the invoice against the underlying order, service, or contract.");
    if (!sections.hasDueDate) {
      actions.push("Add or verify a due date before approving payment.");
    }
    if (!sections.hasTotalAmount) {
      actions.push("Confirm the final payable total and any tax treatment.");
    }
  }

  if (documentType === "report") {
    actions.push("Verify whether the conclusions are supported by the evidence in the body.");
    if (!sections.hasRecommendations) {
      actions.push("Add explicit next steps, owners, or decision guidance.");
    }
    if (!sections.hasQuantifiedEvidence) {
      actions.push("Strengthen the report with metrics, comparisons, or dated evidence.");
    }
  }

  if (documentType === "other") {
    actions.push("Review the original PDF manually to confirm the document's purpose and critical fields.");
  }

  if (redFlags.some((item) => item.toLowerCase().includes("short"))) {
    actions.push("Use a cleaner export if the PDF text looks partial or incomplete.");
  }

  return uniqueStrings(actions).slice(0, 4);
}

function buildRoleMatch(
  text: string,
  documentType: ResolvedDocumentType,
  sections: SectionSignals,
  facts: ExtractedFact[],
  analysisGoal?: string,
  roleSetup?: RoleSetup,
  resumeSignals?: ResumeScreenSignals | null
): AnalysisResult["roleMatch"] {
  if (documentType !== "cv") {
    return {
      summary: "Role matching is only applied to resume-style screening runs.",
      criteria: [],
    };
  }

  const criteria = extractRoleCriteriaFromBrief(
    analysisGoal,
    text,
    sections,
    facts,
    roleSetup,
    resumeSignals ?? null
  );
  const matched = criteria.filter((item) => item.status === "matched").length;
  const partial = criteria.filter((item) => item.status === "partial").length;
  const missing = criteria.filter((item) => item.status === "missing").length;

  const summary = analysisGoal?.trim() || hasRoleSetup(roleSetup)
    ? matched >= Math.max(2, missing)
      ? "The CV shows encouraging overlap with the hiring brief, though a few items still need verification."
      : "The CV only partially aligns with the hiring brief and leaves a few role requirements unproven."
    : sections.hasExperience && sections.hasSkills
      ? "The CV has enough core structure for a first-pass role screen, with experience and skills surfaced in the text."
      : "The CV can be screened, but the parsed text does not surface enough structured signals to judge fit cleanly.";

  return {
    summary:
      criteria.length > 0
        ? `${summary} ${matched} matched, ${partial} partial, ${missing} missing.`
        : summary,
    criteria,
  };
}

function buildEvidencePoints(
  text: string,
  documentType: ResolvedDocumentType,
  highlights: string[],
  redFlags: string[],
  roleCriteria: RoleCriterionMatch[],
  facts: ExtractedFact[],
  resumeSignals: ResumeScreenSignals | null
): EvidencePoint[] {
  const evidence: EvidencePoint[] = [];
  const sentences = extractSentences(text);

  if (documentType === "cv") {
    for (const criterion of roleCriteria.filter((item) => item.status === "matched").slice(0, 2)) {
      evidence.push({
        title: criterion.criterion,
        excerpt: findEvidenceSnippet(sentences, criterion.criterion, criterion.evidence),
        rationale: criterion.evidence,
        tone: "strength",
      });
    }

    const quantifiedSnippet = findSentenceMatching(sentences, /\b\d+(?:\.\d+)?%|\b\d+\+?\s+(?:years|yrs)\b|[$â‚¬Â£â‚¦]\s?\d/i);
    if (quantifiedSnippet) {
      evidence.push({
        title: "Measured impact",
        excerpt: quantifiedSnippet,
        rationale: "The CV includes quantified evidence, which increases credibility during screening.",
        tone: "strength",
      });
    }

    const missingCriterion = roleCriteria.find((item) => item.status === "missing");
    if (missingCriterion) {
      evidence.push({
        title: `Gap: ${missingCriterion.criterion}`,
        excerpt: "No clear supporting evidence for this requirement was found in the parsed CV text.",
        rationale: missingCriterion.evidence,
        tone: "concern",
      });
    }

    for (const hit of resumeSignals?.matchedCriteria.slice(0, 2) ?? []) {
      evidence.push({
        title: `Role-fit evidence: ${hit.label}`,
        excerpt: trimEvidenceSnippet(hit.evidence),
        rationale:
          hit.strength === "matched"
            ? "This line provides direct evidence tied to the requested role criteria."
            : "This line partially supports the requested role criteria but still needs validation.",
        tone: hit.strength === "matched" ? "strength" : "neutral",
      });
    }
  }

  const firstFact = facts[0];
  if (firstFact) {
    evidence.push({
      title: `Detected ${firstFact.label}`,
      excerpt: firstFact.value,
      rationale: "Structured facts help anchor the screening result in concrete resume details.",
      tone: "neutral",
    });
  }

  if (evidence.length < 3 && highlights[0]) {
    evidence.push({
      title: "Screening signal",
      excerpt: highlights[0],
      rationale: "This signal was surfaced during the initial automated pass.",
      tone: "neutral",
    });
  }

  if (evidence.length < 4 && redFlags[0]) {
    evidence.push({
      title: "Primary concern",
      excerpt: redFlags[0],
      rationale: "This issue is worth validating manually before a hiring decision is made.",
      tone: "concern",
    });
  }

  return dedupeEvidencePoints(evidence).slice(0, 6);
}

function buildInterviewQuestions(
  documentType: ResolvedDocumentType,
  roleCriteria: RoleCriterionMatch[],
  redFlags: string[],
  analysisGoal?: string
) {
  const questions: string[] = [];

  if (documentType === "cv" && analysisGoal?.trim()) {
    questions.push(
      `Which parts of your background best match this hiring brief: ${trimSentence(analysisGoal)}?`
    );
  }

  for (const criterion of roleCriteria.filter((item) => item.status !== "matched").slice(0, 3)) {
    questions.push(`Can you walk me through your hands-on experience with ${criterion.criterion.toLowerCase()}?`);
  }

  if (redFlags.some((item) => item.toLowerCase().includes("measurable"))) {
    questions.push("Can you share a project where you can quantify the outcome, impact, or scale of your work?");
  }

  if (redFlags.some((item) => item.toLowerCase().includes("experience section"))) {
    questions.push("Can you outline your most relevant recent roles and the scope of responsibility in each one?");
  }

  if (questions.length < 3) {
    questions.push("Which project in your resume is the best proof of fit for this role, and what exactly was your contribution?");
  }

  if (questions.length < 4) {
    questions.push("What tools, systems, or workflows do you use most confidently in day-to-day work?");
  }

  return uniqueStrings(questions).slice(0, 6);
}

function buildSkillAssessments(
  roleCriteria: RoleCriterionMatch[],
  roleSetup?: RoleSetup
): SkillAssessment[] {
  const assessments = roleCriteria.map((criterion) => ({
    skill: criterion.criterion,
    category: roleSetup?.mustHaveSkills.some(
      (skill) => skill.toLowerCase() === criterion.criterion.toLowerCase()
    )
      ? "must-have"
      : roleSetup?.niceToHaveSkills.some(
            (skill) => skill.toLowerCase() === criterion.criterion.toLowerCase()
          )
        ? "nice-to-have"
        : "general",
    status:
      criterion.status === "matched"
        ? "strong"
        : criterion.status === "partial"
          ? "partial"
          : "missing",
    score:
      criterion.status === "matched"
        ? 88
        : criterion.status === "partial"
          ? 62
          : 28,
    evidence: criterion.evidence,
  })) satisfies SkillAssessment[];

  if (assessments.length > 0) {
    return assessments.slice(0, 8);
  }

  return [
    {
      skill: "General role fit",
      category: "general",
      status: "unclear",
      score: 52,
      evidence: "The resume could be screened, but there was not enough structured role-fit data to grade specific skills.",
    },
  ];
}

function buildRiskSignals(
  redFlags: string[],
  roleCriteria: RoleCriterionMatch[]
): RiskSignal[] {
  const missingCriteriaCount = roleCriteria.filter((item) => item.status === "missing").length;
  const risks: RiskSignal[] = [];

  if (missingCriteriaCount > 0) {
    risks.push({
      category: "Role fit gaps",
      level: missingCriteriaCount >= 2 ? "high" : "medium",
      summary: `${missingCriteriaCount} role requirement${missingCriteriaCount === 1 ? "" : "s"} appeared missing in the parsed CV.`,
    });
  }

  for (const flag of redFlags.slice(0, 3)) {
    risks.push({
      category: risks.length === 0 ? "Primary concern" : `Concern ${risks.length + 1}`,
      level: flag.toLowerCase().includes("no clear") || flag.toLowerCase().includes("missing")
        ? "high"
        : "medium",
      summary: flag,
    });
  }

  if (risks.length === 0) {
    risks.push({
      category: "Screening confidence",
      level: "low",
      summary: "No major risk signals stood out in the local fallback screen.",
    });
  }

  return risks.slice(0, 5);
}

function buildScoreBreakdown(
  text: string,
  documentType: ResolvedDocumentType,
  sections: SectionSignals,
  facts: ExtractedFact[],
  redFlags: string[],
  roleCriteria: RoleCriterionMatch[],
  resumeSignals: ResumeScreenSignals | null
): ScoreBreakdownItem[] {
  if (documentType === "cv") {
    return buildCvScoreBreakdown(
      text,
      sections,
      facts,
      redFlags,
      roleCriteria,
      resumeSignals
    );
  }

  const claritySignals = [
    sections.hasExecutiveSummary,
    sections.hasExperience,
    sections.hasSkills,
    sections.hasPaymentTerms,
    sections.hasFindings,
    sections.hasRecommendations,
    sections.hasInvoiceNumber,
  ].filter(Boolean).length;
  const clarity = clampScore(
    48 + claritySignals * 7 + Math.min(facts.length, 4) * 3 - (redFlags.length > 3 ? 6 : 0)
  );

  const completeness = clampScore(
    completenessScore(documentType, sections) - (text.length < 700 ? 5 : 0)
  );

  const risk = clampScore(
    88 - redFlags.length * 11 - missingCriticalCount(documentType, sections) * 4
  );

  return [
    {
      category: "Clarity",
      score: clarity,
      note:
        clarity >= 75
          ? "Sectioning and structured details make the document relatively easy to scan."
          : "The document would benefit from clearer headings, labels, or more explicit structure.",
    },
    {
      category: "Completeness",
      score: completeness,
      note:
        completeness >= 75
          ? "Most of the expected elements for this document type appear to be present."
          : "Some expected fields or sections are missing or weakly signposted.",
    },
    {
      category: "Risk",
      score: risk,
      note:
        risk >= 75
          ? "Only limited high-risk gaps stood out in the local fallback review."
          : "Missing essentials or weak support signals increase the need for manual review.",
    },
  ];
}

function buildRecommendation(
  scoreValue: number,
  redFlags: string[],
  roleCriteria: RoleCriterionMatch[]
): HiringRecommendation {
  const missingCount = roleCriteria.filter((item) => item.status === "missing").length;

  if (scoreValue >= 84 && missingCount <= 1) {
    return {
      decision: "Shortlist",
      summary: "The automated screen sees enough fit and credible evidence to justify shortlisting this candidate.",
      confidence: "High",
    };
  }

  if (scoreValue >= 68) {
    return {
      decision: "Interview",
      summary: "The profile looks promising, but the team should use the interview to validate a few open questions.",
      confidence: missingCount > 1 ? "Medium" : "High",
    };
  }

  if (scoreValue >= 52) {
    return {
      decision: "Hold",
      summary: "The CV shows partial fit, but the current evidence is not strong enough for a confident move forward.",
      confidence: "Medium",
    };
  }

  return {
    decision: "Reject",
    summary: `The screen found too many concerns to recommend next steps confidently${redFlags[0] ? `, starting with ${lowercaseFirst(trimSentence(redFlags[0]))}` : ""}.`,
    confidence: "High",
  };
}

function buildCandidateProfile(
  text: string,
  facts: ExtractedFact[],
  resumeSignals: ResumeScreenSignals | null
): CandidateProfile {
  const name = detectCandidateName(text);
  const headline = detectCandidateHeadline(text, name);
  const experience = facts.find((fact) => fact.label === "Experience signal")?.value;
  const email = facts.find((fact) => fact.label === "Email")?.value;
  const phone = facts.find((fact) => fact.label === "Phone")?.value;
  const link = facts.find((fact) => fact.label === "Professional link")?.value;
  const fields = [
    experience ? { label: "Experience", value: experience } : null,
    email ? { label: "Email", value: email } : null,
    phone ? { label: "Phone", value: phone } : null,
    link ? { label: "Profile link", value: link } : null,
    resumeSignals?.matchedCriteria[0]
      ? { label: "Role signal", value: resumeSignals.matchedCriteria[0].label }
      : null,
  ].filter((item): item is NonNullable<typeof item> => item !== null);

  return {
    name,
    headline,
    summary:
      experience || headline
        ? `${name} appears to bring ${
            experience ? experience.toLowerCase() : "relevant experience"
          } with a profile centered on ${headline.toLowerCase()}${
            resumeSignals?.matchedCriteria[0]
              ? ` and evidence related to ${resumeSignals.matchedCriteria[0].label.toLowerCase()}`
              : ""
          }.`
        : `${name} has a parsed candidate profile, but the resume text does not expose many structured summary details.`,
    fields: fields.slice(0, 4),
  };
}

function buildSummary({
  text,
  resolvedType,
  pageCount,
  highlights,
  redFlags,
  analysisGoal,
}: {
  text: string;
  resolvedType: ResolvedDocumentType;
  pageCount: number;
  highlights: string[];
  redFlags: string[];
  analysisGoal?: string;
}) {
  const wordCount = text.split(/\s+/).filter(Boolean).length;
  const opening = {
    cv: "This appears to be a candidate CV prepared for hiring review.",
    contract: "This appears to be a contract or agreement.",
    invoice: "This appears to be an invoice or billing document.",
    report: "This appears to be a report or findings document.",
    other: "This document does not map cleanly to one of the main presets.",
  }[resolvedType];

  const coverage = `The extracted text spans ${pageCount} page${pageCount === 1 ? "" : "s"} and about ${wordCount.toLocaleString()} words.`;
  const focus = analysisGoal?.trim()
    ? resolvedType === "cv"
      ? `The screening was steered toward ${trimSentence(analysisGoal).toLowerCase()}.`
      : `The review was steered toward ${trimSentence(analysisGoal).toLowerCase()}.`
    : "";
  const strength = highlights[1] || highlights[0] || "";
  const concern =
    redFlags[0] && !redFlags[0].startsWith("No major")
      ? `${resolvedType === "cv" ? "Main hiring concern" : "Main concern"}: ${lowercaseFirst(redFlags[0])}`
      : resolvedType === "cv"
        ? "No major structural hiring issues stood out in the fallback screen."
        : "No major structural issues stood out in the fallback review.";

  return [opening, coverage, focus, strength, concern].filter(Boolean).join(" ");
}

function buildScoreRationale(
  documentType: ResolvedDocumentType,
  breakdown: ScoreBreakdownItem[],
  redFlags: string[]
) {
  const average = Math.round(
    breakdown.reduce((sum, item) => sum + item.score, 0) / breakdown.length
  );

  if (documentType === "cv") {
    if (average >= 80) {
      return "The CV scores well for shortlist consideration because it shows relevant experience, readable structure, and credible evidence of impact.";
    }

    if (average >= 62) {
      return "The candidate looks potentially viable, but some weaker signals still need recruiter or hiring-manager follow-up before moving forward.";
    }

    return `The screening score is held back by issues such as ${trimSentence(redFlags[0] || "missing essential candidate details").toLowerCase()}.`;
  }

  if (average >= 80) {
    return `The ${documentType} scores well because the text shows strong structure and enough key fields for a confident first-pass review.`;
  }

  if (average >= 62) {
    return `The ${documentType} looks usable, but a few missing or weakly signposted details justify a careful manual check.`;
  }

  return `The score is held back by visible gaps such as ${trimSentence(redFlags[0] || "missing essential details").toLowerCase()}.`;
}

function buildCvScoreBreakdown(
  text: string,
  sections: SectionSignals,
  facts: ExtractedFact[],
  redFlags: string[],
  roleCriteria: RoleCriterionMatch[],
  resumeSignals: ResumeScreenSignals | null
): ScoreBreakdownItem[] {
  const matchedCount = roleCriteria.filter((item) => item.status === "matched").length;
  const partialCount = roleCriteria.filter((item) => item.status === "partial").length;
  const missingCount = roleCriteria.filter((item) => item.status === "missing").length;
  const achievementCount = resumeSignals?.achievementLines.length ?? 0;
  const futureDateCount = resumeSignals?.futureDateLines.length ?? 0;
  const explicitYears = resumeSignals?.explicitYears ?? extractCandidateYears(facts) ?? 0;
  const roleFit = clampScore(
    42 +
      matchedCount * 16 +
      partialCount * 7 +
      (sections.hasExperience ? 10 : 0) +
      (sections.hasSkills ? 10 : 0) -
      missingCount * 11
  );

  const experienceDepth = clampScore(
    44 +
      (sections.hasExperience ? 12 : 0) +
      Math.min(explicitYears, 10) * 3 +
      achievementCount * 4 -
      futureDateCount * 8
  );

  const impactEvidence = clampScore(
    40 +
      (sections.hasQuantifiedEvidence ? 20 : 0) +
      achievementCount * 7 +
      (resumeSignals?.matchedCriteria.length ?? 0) * 4 -
      (!sections.hasQuantifiedEvidence ? 8 : 0)
  );

  const hiringRisk = clampScore(
    90 -
      redFlags.length * 8 -
      missingCriticalCount("cv", sections) * 5 -
      missingCount * 5 -
      futureDateCount * 8
  );

  return [
    {
      category: "Role fit",
      score: roleFit,
      note:
        roleFit >= 75
          ? "The CV surfaces enough role-aligned experience and skills for shortlist consideration."
          : "Role alignment is not yet clear enough from the visible experience and skills signals.",
    },
    {
      category: "Experience",
      score: experienceDepth,
      note:
        experienceDepth >= 75
          ? "The CV shows enough depth, history, or experience range to support a serious interview review."
          : "The visible experience is still too shallow, unclear, or unsupported for a confident decision.",
    },
    {
      category: "Evidence of impact",
      score: impactEvidence,
      note:
        impactEvidence >= 75
          ? "The candidate shows measurable evidence that strengthens credibility."
          : "The CV would benefit from clearer outcomes, scale, or quantified accomplishments.",
    },
    {
      category: "Hiring risk",
      score: hiringRisk,
      note:
        hiringRisk >= 75
          ? "Only limited structural concerns stood out in the local screen."
          : "Visible gaps still create enough uncertainty to justify a closer manual check.",
    },
  ];
}

function extractRoleCriteriaFromBrief(
  analysisGoal: string | undefined,
  text: string,
  sections: SectionSignals,
  facts: ExtractedFact[],
  roleSetup?: RoleSetup,
  resumeSignals?: ResumeScreenSignals | null
): RoleCriterionMatch[] {
  const criteria: RoleCriterionMatch[] = [];
  const lowerGoal = analysisGoal?.toLowerCase().trim() || "";
  const normalizedMustHaves =
    roleSetup?.mustHaveSkills.map((skill) => skill.toLowerCase()) ?? [];
  const normalizedNiceToHaves =
    roleSetup?.niceToHaveSkills.map((skill) => skill.toLowerCase()) ?? [];

  for (const skill of [...normalizedMustHaves, ...normalizedNiceToHaves].slice(0, 6)) {
    criteria.push(buildCriterionAssessment(skill, text, resumeSignals ?? null));
  }

  if (!lowerGoal && criteria.length === 0) {
    return [
      {
        criterion: "Relevant experience",
        status: sections.hasExperience ? "matched" : "missing",
        evidence: sections.hasExperience
          ? "The parsed resume includes a dedicated experience section."
          : "A clear work-experience section was not detected in the parsed text.",
      },
      {
        criterion: "Core skills",
        status: sections.hasSkills ? "matched" : "missing",
        evidence: sections.hasSkills
          ? "The resume surfaces a dedicated skills or tools section."
          : "Core tools or skills are not clearly grouped in the parsed resume text.",
      },
      {
        criterion: "Evidence of impact",
        status: sections.hasQuantifiedEvidence ? "matched" : "partial",
        evidence: sections.hasQuantifiedEvidence
          ? "The resume includes quantifiable signals such as years, percentages, or measurable outcomes."
          : "The profile reads clearly, but stronger measurable outcomes would improve confidence.",
      },
    ];
  }

  const skillCriteria = roleSkillCatalog
    .filter((skill) => lowerGoal.includes(skill))
    .slice(0, 4)
    .map((skill) => {
      const match: RoleCriterionMatch = {
        ...buildCriterionAssessment(skill, text, resumeSignals ?? null),
      };

      return match;
    });

  criteria.push(...skillCriteria);

  const requiredYears = extractRequiredYears(lowerGoal);
  if (requiredYears !== null) {
    const candidateYears = resumeSignals?.explicitYears ?? extractCandidateYears(facts);
    criteria.push({
      criterion: `${requiredYears}+ years relevant experience`,
      status:
        candidateYears === null
          ? "partial"
          : candidateYears >= requiredYears
            ? "matched"
            : "missing",
      evidence:
        candidateYears === null
          ? "The hiring brief specifies years of experience, but the parsed resume does not state it clearly."
          : `The parsed resume shows about ${candidateYears}+ years of experience.`,
    });
  }

  if (!criteria.some((item) => item.criterion.toLowerCase().includes("communication"))) {
    const communicationRequested =
      lowerGoal.includes("communication") ||
      lowerGoal.includes("stakeholder") ||
      lowerGoal.includes("customer");

    if (communicationRequested) {
      criteria.push({
        criterion: "Communication",
        status: sections.hasExperience ? "partial" : "missing",
        evidence: sections.hasExperience
          ? "The resume suggests professional experience, but communication strength still needs interview validation."
          : "The brief values communication, but the parsed resume offers limited context for it.",
      });
    }
  }

  if (criteria.length === 0) {
    criteria.push(
      {
        criterion: "Relevant experience",
        status: sections.hasExperience ? "matched" : "missing",
        evidence: sections.hasExperience
          ? "The parsed resume includes an experience section that can be screened."
          : "A clear experience section was not detected.",
      },
      {
        criterion: "Role-specific skills",
        status: sections.hasSkills ? "matched" : "partial",
        evidence: sections.hasSkills
          ? "The resume lists tools or competencies that can be mapped to the hiring brief."
          : "The role brief is present, but the CV does not group role skills clearly.",
      }
    );
  }

  return uniqueRoleCriteria(criteria).slice(0, 6);
}

function analyzeResumeSignals(
  text: string,
  analysisGoal: string | undefined,
  roleSetup: RoleSetup | undefined,
  facts: ExtractedFact[]
): ResumeScreenSignals {
  const topLines = text
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(0, 10);
  const lines = text
    .split("\n")
    .map((line) => line.replace(/\s+/g, " ").trim())
    .filter((line) => line.length >= 8 && line.length <= 220);
  const combinedRoleBrief = [
    analysisGoal,
    roleSetup?.title,
    roleSetup?.summary,
    roleSetup?.mustHaveSkills.join(", "),
    roleSetup?.niceToHaveSkills.join(", "),
    roleSetup?.interviewFocus.join(", "),
  ]
    .filter(Boolean)
    .join(" ");

  return {
    topLines,
    recentRoleLines: lines
      .filter((line) => /(engineer|developer|support|analyst|manager|specialist|designer|consultant|lead|administrator)/i.test(line))
      .slice(0, 4),
    achievementLines: uniqueStrings(
      lines.filter(
        (line) =>
          /\b(improved|reduced|increased|built|led|managed|resolved|implemented|launched|delivered|optimized|automated)\b/i.test(
            line
          ) &&
          (/\d/.test(line) || line.split(/\s+/).length >= 8)
      )
    ).slice(0, 5),
    futureDateLines: uniqueStrings(lines.filter((line) => containsFutureDate(line))).slice(0, 3),
    explicitYears: extractCandidateYears(facts) ?? extractYearsExperienceFromText(text),
    matchedCriteria: extractMatchedResumeCriteria(lines, combinedRoleBrief),
  };
}

function extractMatchedResumeCriteria(lines: string[], roleBriefText: string) {
  const criteria = uniqueStrings([
    ...extractRoleBriefCriteria(roleBriefText),
  ]);

  return criteria
    .map((criterion) => {
      const assessment = assessCriterionEvidence(lines, criterion);

      return assessment
        ? {
            label: assessment.criterion,
            evidence: assessment.evidence,
            strength: assessment.status,
          }
        : null;
    })
    .filter((item): item is ResumeSignalHit => item !== null)
    .slice(0, 6);
}

function extractRoleBriefCriteria(value: string) {
  const normalized = value.toLowerCase();
  const criteria = new Set<string>();

  for (const skill of roleSkillCatalog) {
    if (matchesCriterionAlias(normalized, skill)) {
      criteria.add(skill);
    }
  }

  for (const segment of normalized.split(/[\n,;|]/)) {
    const cleaned = segment
      .replace(/\b(must[- ]?have|nice[- ]?to[- ]?have|required|requirement|priority|priorities|focus on|focus)\b/gi, "")
      .replace(/\s+/g, " ")
      .trim();

    if (!cleaned || cleaned.length < 4 || cleaned.split(" ").length > 5) {
      continue;
    }

    if (/[a-z]/.test(cleaned)) {
      criteria.add(cleaned);
    }
  }

  return [...criteria].slice(0, 8);
}

function buildCriterionAssessment(
  criterion: string,
  text: string,
  resumeSignals: ResumeScreenSignals | null
): RoleCriterionMatch {
  const lines = resumeSignals?.recentRoleLines.length
    ? [...resumeSignals.recentRoleLines, ...resumeSignals.achievementLines]
    : text
        .split("\n")
        .map((line) => line.trim())
        .filter(Boolean)
        .slice(0, 80);
  const assessment = assessCriterionEvidence(lines, criterion);

  if (assessment) {
    return assessment;
  }

  return {
    criterion: toTitleLabel(criterion),
    status: "missing",
    evidence: `The hiring brief includes "${criterion}", but the parsed resume does not show clear evidence for it.`,
  };
}

function assessCriterionEvidence(lines: string[], criterion: string): RoleCriterionMatch | null {
  const normalizedCriterion = criterion.toLowerCase().trim();
  const directMatch = lines.find((line) => matchesCriterionAlias(line.toLowerCase(), normalizedCriterion));

  if (directMatch) {
    return {
      criterion: toTitleLabel(normalizedCriterion),
      status: "matched",
      evidence: directMatch,
    };
  }

  const tokens = normalizedCriterion
    .split(/[^a-z0-9+.#]+/i)
    .map((item) => item.trim())
    .filter((item) => item.length >= 3);
  const partialMatch = lines.find((line) => {
    const normalizedLine = line.toLowerCase();
    const tokenHits = tokens.filter((token) => normalizedLine.includes(token)).length;
    return tokenHits >= Math.max(1, Math.ceil(tokens.length / 2));
  });

  if (partialMatch) {
    return {
      criterion: toTitleLabel(normalizedCriterion),
      status: "partial",
      evidence: partialMatch,
    };
  }

  return null;
}

function matchesCriterionAlias(text: string, criterion: string) {
  const aliases = roleSkillAliases[criterion] ?? [criterion];
  return aliases.some((alias) => text.includes(alias));
}

function extractYearsExperienceFromText(text: string) {
  const directYears = [...text.matchAll(/\b(\d{1,2})\+?\s*(?:years|yrs)\b/gi)]
    .map((match) => Number(match[1]))
    .filter((value) => Number.isFinite(value));

  if (directYears.length > 0) {
    return Math.max(...directYears);
  }

  return null;
}

function containsFutureDate(value: string) {
  const currentYear = new Date().getFullYear();
  const years = [...value.matchAll(/\b(20\d{2})\b/g)]
    .map((match) => Number(match[1]))
    .filter((year) => Number.isFinite(year));

  return years.some((year) => year > currentYear);
}

function trimEvidenceSnippet(value: string) {
  return value.replace(/\s+/g, " ").trim().slice(0, 180);
}

function extractRequiredYears(value: string) {
  const match = value.match(/\b(\d{1,2})\+?\s*(?:years|yrs)\b/i);
  return match?.[1] ? Number(match[1]) : null;
}

function extractCandidateYears(facts: ExtractedFact[]) {
  const value = facts.find((fact) => fact.label === "Experience signal")?.value;
  const match = value?.match(/\b(\d{1,2})\+?\b/);
  return match?.[1] ? Number(match[1]) : null;
}

function detectCandidateName(text: string) {
  const lines = text
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(0, 6);

  const candidate = lines.find((line) => {
    const words = line.split(/\s+/);
    return (
      words.length >= 2 &&
      words.length <= 4 &&
      !containsEmail(line) &&
      !containsPhone(line) &&
      !/linkedin|github|www\.|http/i.test(line) &&
      /^[A-Z][A-Za-z'`-]+(?:\s+[A-Z][A-Za-z'`-]+)+$/.test(line)
    );
  });

  return candidate || "Unknown candidate";
}

function detectCandidateHeadline(text: string, name: string) {
  const lines = text
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(0, 8);

  const headline = lines.find((line) => {
    if (line === name) {
      return false;
    }

    return (
      !containsEmail(line) &&
      !containsPhone(line) &&
      !/linkedin|github|www\.|http/i.test(line) &&
      line.split(/\s+/).length <= 10
    );
  });

  return headline || "Candidate profile";
}

function extractSentences(text: string) {
  return text
    .replace(/\n+/g, " ")
    .split(/(?<=[.!?])\s+/)
    .map((sentence) => sentence.trim())
    .filter((sentence) => sentence.length >= 24);
}

function findSentenceMatching(sentences: string[], pattern: RegExp) {
  return sentences.find((sentence) => pattern.test(sentence)) || "";
}

function findEvidenceSnippet(
  sentences: string[],
  criterion: string,
  fallback: string
) {
  const terms = criterion
    .toLowerCase()
    .split(/[^a-z0-9+.#]+/i)
    .filter((term) => term.length >= 3);
  const match = sentences.find((sentence) =>
    terms.some((term) => sentence.toLowerCase().includes(term))
  );

  return match || fallback;
}

function dedupeEvidencePoints(points: EvidencePoint[]) {
  const seen = new Set<string>();

  return points.filter((point) => {
    const key = `${point.title}:${point.excerpt}:${point.rationale}`;

    if (seen.has(key)) {
      return false;
    }

    seen.add(key);
    return true;
  });
}

function uniqueRoleCriteria(criteria: RoleCriterionMatch[]) {
  const seen = new Set<string>();

  return criteria.filter((criterion) => {
    const key = criterion.criterion.toLowerCase();

    if (seen.has(key)) {
      return false;
    }

    seen.add(key);
    return true;
  });
}

function toTitleLabel(value: string) {
  return value
    .split(/[\s/]+/)
    .map((part) =>
      part.length <= 3 || /[.+]/.test(part)
        ? part.toUpperCase()
        : part.charAt(0).toUpperCase() + part.slice(1)
    )
    .join(" ");
}

function hasRoleSetup(roleSetup?: RoleSetup) {
  return Boolean(
    roleSetup &&
      (roleSetup.title ||
        roleSetup.seniority ||
        roleSetup.location ||
        roleSetup.summary ||
        roleSetup.mustHaveSkills.length > 0 ||
        roleSetup.niceToHaveSkills.length > 0 ||
        roleSetup.interviewFocus.length > 0)
  );
}

function completenessScore(
  documentType: ResolvedDocumentType,
  sections: SectionSignals
) {
  if (documentType === "cv") {
    return scoreFromBooleans([
      sections.hasContactDetails,
      sections.hasExperience,
      sections.hasEducation,
      sections.hasSkills,
      sections.hasQuantifiedEvidence,
    ]);
  }

  if (documentType === "contract") {
    return scoreFromBooleans([
      sections.hasEffectiveDate,
      sections.hasPaymentTerms,
      sections.hasTermination,
      sections.hasLiability || sections.hasGoverningLaw,
      sections.hasSignature,
    ]);
  }

  if (documentType === "invoice") {
    return scoreFromBooleans([
      sections.hasInvoiceNumber,
      sections.hasDueDate,
      sections.hasTotalAmount,
      sections.hasTax,
      sections.hasVendorDetails,
    ]);
  }

  if (documentType === "report") {
    return scoreFromBooleans([
      sections.hasExecutiveSummary,
      sections.hasFindings,
      sections.hasMethodology,
      sections.hasRecommendations,
      sections.hasConclusion,
    ]);
  }

  return scoreFromBooleans([
    sections.hasContactDetails,
    sections.hasQuantifiedEvidence,
    sections.hasExecutiveSummary || sections.hasExperience || sections.hasFindings,
  ]);
}

function missingCriticalCount(
  documentType: ResolvedDocumentType,
  sections: SectionSignals
) {
  if (documentType === "cv") {
    return countFalse([
      sections.hasContactDetails,
      sections.hasExperience,
      sections.hasSkills,
    ]);
  }

  if (documentType === "contract") {
    return countFalse([
      sections.hasEffectiveDate,
      sections.hasPaymentTerms,
      sections.hasTermination,
    ]);
  }

  if (documentType === "invoice") {
    return countFalse([
      sections.hasInvoiceNumber,
      sections.hasDueDate,
      sections.hasTotalAmount,
    ]);
  }

  if (documentType === "report") {
    return countFalse([
      sections.hasFindings,
      sections.hasRecommendations,
      sections.hasConclusion,
    ]);
  }

  return countFalse([sections.hasQuantifiedEvidence]);
}

function keywordScore(text: string, keywords: string[]) {
  return keywords.reduce(
    (score, keyword) => score + (text.includes(keyword) ? 1 : 0),
    0
  );
}

function scoreFromBooleans(values: boolean[]) {
  const present = values.filter(Boolean).length;
  return clampScore(40 + (present / values.length) * 50);
}

function countFalse(values: boolean[]) {
  return values.filter((value) => !value).length;
}

function containsAny(text: string, snippets: string[]) {
  return snippets.some((snippet) => text.includes(snippet));
}

function matchFirst(text: string, pattern: RegExp) {
  return text.match(pattern)?.[0]?.trim() || "";
}

function captureGroup(text: string, pattern: RegExp) {
  return text.match(pattern)?.[1]?.trim() || "";
}

function containsEmail(text: string) {
  return /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i.test(text);
}

function containsPhone(text: string) {
  return /(?:\+\d{1,3}[\s-]?)?(?:\(?\d{2,4}\)?[\s-]?){2,4}\d{3,4}/.test(text);
}

function containsCurrency(text: string) {
  return /[$€£₦]\s?\d[\d,]*(?:\.\d{2})?/.test(text);
}

function containsDate(text: string) {
  return /\b(?:\d{1,2}[/-]\d{1,2}[/-]\d{2,4}|(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]* \d{1,2},? \d{4})\b/i.test(
    text
  );
}

function countMatches(text: string, pattern: RegExp) {
  return text.match(pattern)?.length ?? 0;
}

function pushFact(facts: ExtractedFact[], label: string, value: string) {
  if (!value) {
    return;
  }

  const normalizedValue = value.replace(/\s+/g, " ").trim();

  if (!normalizedValue) {
    return;
  }

  if (facts.some((fact) => fact.label === label && fact.value === normalizedValue)) {
    return;
  }

  facts.push({ label, value: normalizedValue });
}

function uniqueStrings(values: string[]) {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))];
}

function clampScore(value: number) {
  return Math.max(25, Math.min(96, Math.round(value)));
}

function trimSentence(value: string) {
  return value.replace(/\s+/g, " ").trim().replace(/[.]+$/, "");
}

function lowercaseFirst(value: string) {
  return value.charAt(0).toLowerCase() + value.slice(1);
}

function scoreLabelFromValue(value: number) {
  if (value >= 85) {
    return "Excellent";
  }

  if (value >= 72) {
    return "Strong";
  }

  if (value >= 55) {
    return "Mixed";
  }

  if (value >= 35) {
    return "Needs review";
  }

  return "Risky";
}
