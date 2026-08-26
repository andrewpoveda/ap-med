export type ArticleTable = {
  headers: string[];
  rows: string[][];
};

export type ArticleSection = {
  id: string;
  number?: string;
  title: string;
  paragraphs: string[];
  bullets?: string[];
  callout?: { label: string; text: string };
  table?: ArticleTable;
};

export type BlogPost = {
  slug: string;
  category: "Mentorship" | "Program Management" | "Healthcare Education" | "Professional Pipelines" | "Comparisons" | "Guides";
  title: string;
  seoTitle: string;
  description: string;
  intro: string;
  author: string;
  published: string;
  updated: string;
  featured?: boolean;
  pullQuote: { quote: string; attribution: string };
  supporting: { label: string; title: string; body: string; items: string[] };
  sections: ArticleSection[];
  related: string[];
};

export const blogCategories = ["All", "Mentorship", "Program Management", "Healthcare Education", "Professional Pipelines", "Comparisons", "Guides"] as const;

export const blogPosts: BlogPost[] = [
  {
    slug: "best-mentoring-platforms-for-healthcare-organizations",
    category: "Comparisons",
    title: "Best mentoring platforms for healthcare organizations: a practical buying guide",
    seoTitle: "Best Mentoring Platforms for Healthcare | AP MED",
    description: "How to evaluate mentoring software when the program connects students, trainees, clinicians, educators, and professional associations.",
    intro: "Healthcare mentoring software should be judged against the program's real operating constraints: who may participate, how people are approved, what makes a defensible match, and which records the organization must retain. Product breadth matters only after those questions are clear.",
    author: "AP MED Editorial",
    published: "2026-08-23",
    updated: "2026-08-25",
    featured: true,
    pullQuote: {
      quote: "A healthcare mentoring platform should fit the program's governance before it fits the organization's feature checklist.",
      attribution: "AP MED buying principle",
    },
    supporting: {
      label: "Procurement checkpoint",
      title: "Ask vendors to demonstrate the difficult parts",
      body: "A useful evaluation uses one representative cohort and asks every vendor to complete the same operational tasks. Screenshots and feature labels are not enough.",
      items: [
        "Configure distinct participant roles and eligibility rules",
        "Explain a recommended match and show an administrator override",
        "Identify an inactive relationship without exposing private notes",
        "Produce the cohort report a board or partner would actually review",
      ],
    },
    sections: [
      {
        id: "start-with-program",
        number: "01",
        title: "Start with the program, not the feature list",
        paragraphs: [
          "Healthcare mentoring programs rarely operate like a generic employee directory. A single initiative may involve pre-health students, professional students, residents, fellows, practicing clinicians, faculty, alumni, and association leaders. Those groups enter the program differently and often need different tracks, eligibility rules, milestones, and oversight.",
          "Before comparing products, write down the actual lifecycle of your program. Who recruits participants? Is there an application? Who decides eligibility? Does a board approve matches? What happens after the introduction? Which outcomes must be reported to a partner, funder, school, or executive team?",
        ],
        callout: { label: "Buying principle", text: "A long feature list is not the same as operational fit. The best platform is the one that removes work from the exact program your team runs." },
      },
      {
        id: "platform-categories",
        number: "02",
        title: "Understand the three platform categories",
        paragraphs: [
          "Most mentoring software falls into one of three broad categories. Enterprise employee platforms focus on L&D, retention, internal mobility, leadership development, and workplace integrations. Higher-education platforms focus on student belonging, retention, career readiness, and institutional insight. Program-focused platforms organize a defined cohort from intake through reporting.",
          "Many products cross these boundaries, and the market changes quickly. The categories are still useful because they reveal the product's default assumptions: who the buyer is, where participant data comes from, and which outcomes matter most.",
        ],
        table: {
          headers: ["Platform type", "Typical buyer", "Common strength", "Question to ask"],
          rows: [
            ["Enterprise workforce", "HR, L&D, talent", "Scale and workplace integrations", "Will it support non-employees and selective cohorts?"],
            ["Higher education", "Student success, academic affairs", "Belonging and learner outcomes", "Will it fit a professionally specific program?"],
            ["Program and pipeline", "Program director, association, school", "Cohort operations and domain fit", "Can it meet institutional security and integration needs?"],
          ],
        },
      },
      {
        id: "requirements",
        number: "03",
        title: "Define the requirements that matter in healthcare",
        paragraphs: [
          "Healthcare organizations should look beyond matching. Recruitment, role-specific profiles, specialty interests, professional stage, support needs, cohort rules, communication, accountability, scheduling, surveys, and program reporting all influence whether a relationship succeeds.",
          "Data governance also deserves early attention. Decide which participant fields are necessary, who may view them, how consent works, and whether the platform will ever hold protected or clinically sensitive information. A mentorship platform should not become an accidental clinical record.",
        ],
        bullets: [
          "Role-specific applications and eligibility review",
          "Explainable matching criteria that fit the program",
          "Cohort and track management",
          "Relationship goals, meetings, milestones, and reminders",
          "Accessible participant communications",
          "Program-level analytics and exportable reporting",
          "Clear security, privacy, retention, and integration posture",
        ],
      },
      {
        id: "shortlist",
        number: "04",
        title: "Build a shortlist by use case",
        paragraphs: [
          "If the program is part of a large employer's talent strategy, evaluate enterprise products such as Qooper, MentorcliQ, Chronus, and Together. If the primary goal is institution-wide student success, Mentor Collective belongs on the shortlist. If the organization needs cross-sector mentoring software with self-serve and enterprise paths, Mentorloop may be relevant.",
          "AP MED Mentors should be evaluated when the program looks like a structured healthcare, education, association, or professional pipeline. Its current differentiation is not enterprise breadth. It is the operating model around applications, cohort review, deterministic matching, relationship activity, milestones, surveys, analytics, and repeatable program cycles.",
        ],
        callout: { label: "Be transparent", text: "No buyer should assume AP MED has the same HRIS, SSO, global workforce, or integration maturity as an established enterprise platform. Those requirements need a direct conversation." },
      },
      {
        id: "demo-scorecard",
        number: "05",
        title: "Use the same scorecard in every demo",
        paragraphs: [
          "A consistent scorecard prevents a polished demo from changing the buying criteria. Give each vendor the same sample cohort, matching rules, administrator roles, communication scenario, and reporting request.",
          "Ask the vendor to show the full workflow rather than a presentation. A useful demo begins with intake and ends with the report your board or partner would actually need.",
        ],
        bullets: [
          "Can the platform model our participant roles and stages?",
          "Can administrators review and override matches without losing the audit trail?",
          "What happens when one mentor cannot continue?",
          "How are inactive relationships identified?",
          "Which integrations are live today, and which require services or a higher plan?",
          "Can we export the records needed for annual reporting?",
          "What is the implementation work for our team?",
        ],
      },
    ],
    related: ["mentor-matching-software-what-to-look-for", "how-to-start-a-mentorship-program"],
  },
  {
    slug: "mentor-matching-software-what-to-look-for",
    category: "Guides",
    title: "Mentor matching software: what to look for before you buy",
    seoTitle: "Mentor Matching Software: What to Look For | AP MED",
    description: "A clear framework for evaluating matching logic, administrator control, participant experience, and the work that begins after a match.",
    intro: "Matching software is easiest to evaluate when the team treats the algorithm as written program policy. The inputs, weights, constraints, capacity rules, and override process should be understandable before anyone accepts a recommended relationship.",
    author: "AP MED Editorial",
    published: "2026-08-23",
    updated: "2026-08-25",
    pullQuote: {
      quote: "A recommendation is only defensible when the program can explain what influenced it and what the software ignored.",
      attribution: "AP MED matching principle",
    },
    supporting: {
      label: "Matching review worksheet",
      title: "Test the exceptions before the happy path",
      body: "The best demonstration profiles are the ones likely to expose a weak rule. Ask the vendor to show how the system behaves, then record whether an administrator can understand and correct the result.",
      items: [
        "A mentee with a rare specialty interest",
        "An oversubscribed mentor at capacity",
        "Two profiles with incomplete preference data",
        "A conflict or exclusion that must never produce a match",
      ],
    },
    sections: [
      {
        id: "matching-is-policy",
        number: "01",
        title: "Treat matching as program policy",
        paragraphs: [
          "A matching algorithm is not neutral. Every question, weight, hard constraint, and missing value expresses a program decision. If specialty is weighted more than location, the program is saying specialty fit matters more. If an unanswered question scores as compatible, the program is deciding not to penalize incomplete preference data.",
          "Program teams should be able to explain those choices to participants and review them over time. A score without an explanation may speed up administration while making the program harder to trust.",
        ],
        callout: { label: "AP MED example", text: "AP MED's current general matching is deterministic: identity 40%, specialty 35%, and mentorship needs 25%. Professional stage is collected but not scored." },
      },
      {
        id: "matching-models",
        number: "02",
        title: "Compare matching models, not marketing labels",
        paragraphs: [
          "Platforms may offer administrator matching, suggested matching, participant self-selection, cohort-level optimization, or AI-supported recommendations. Each model changes who has control and who carries the administrative risk.",
          "Self-selection can increase participant agency but may leave some people without options. Administrator matching supports deliberate oversight but creates workload. Automated matching can scale, but only when the input data and constraints reflect the program honestly.",
        ],
        table: {
          headers: ["Model", "Useful when", "Watch for"],
          rows: [
            ["Administrator selected", "Programs need oversight or approval", "Coordinator workload and subjective decisions"],
            ["Suggested matches", "Participants can choose from a controlled shortlist", "Popular mentors may receive uneven demand"],
            ["Self-match directory", "Agency and discovery are central", "Unmatched or less-visible participants"],
            ["Automated optimization", "Large cohorts have consistent profile data", "Opaque weights, missing values, and hard constraints"],
          ],
        },
      },
      {
        id: "inputs",
        number: "03",
        title: "Inspect the data that drives the result",
        paragraphs: [
          "Ask which fields are used, how answers are normalized, and what happens when someone skips a question. Exact-match tags can be reliable and explainable, but inconsistent labels can silently destroy overlap. Free-text similarity can capture nuance, but it may be harder to audit.",
          "The profile form and the algorithm must be designed together. Collecting a field that never affects matching or program support creates participant burden without operational value.",
        ],
        bullets: [
          "Which fields are preferences, constraints, or display-only context?",
          "Can the program change weights without professional services?",
          "How are missing answers handled?",
          "Can administrators see why a pair was recommended?",
          "Can one mentor accept several mentees, and is capacity enforced?",
          "How are conflicts, exclusions, and rematches handled?",
        ],
      },
      {
        id: "after-match",
        number: "04",
        title: "Evaluate everything after the introduction",
        paragraphs: [
          "A strong match can still fail when participants do not know what to do next. The software should support the relationship with clear expectations, scheduling, goals, prompts or milestones, communication, feedback, and an escalation path.",
          "Administrators need a way to distinguish a quiet but healthy relationship from one that never started. Meeting logs, lightweight check-ins, surveys, and participant-reported sentiment are different signals. Choose the least intrusive set that gives the program enough visibility to help.",
        ],
      },
      {
        id: "validation",
        number: "05",
        title: "Pilot the logic with real program scenarios",
        paragraphs: [
          "Before launch, create representative profiles and edge cases. Include participants with few preferences, oversubscribed mentors, rare specialties, conflicting constraints, and incomplete answers. Review both the top recommendations and the people who receive no strong option.",
          "A pilot should test fairness and administration, not just whether the software produces a list. Record the reasons for overrides so the next cohort improves the policy rather than repeating hidden judgment calls.",
        ],
      },
    ],
    related: ["best-mentoring-platforms-for-healthcare-organizations", "how-to-start-a-mentorship-program"],
  },
  {
    slug: "how-to-start-a-mentorship-program",
    category: "Program Management",
    title: "How to start a mentorship program that can survive its second cohort",
    seoTitle: "How to Start a Mentorship Program | AP MED",
    description: "A step-by-step operating guide for designing, launching, measuring, and repeating a structured mentorship program.",
    intro: "The first cohort can survive on urgency and individual effort. A durable mentorship program needs decisions, ownership, participant expectations, and records that another administrator can understand when the next application cycle opens.",
    author: "AP MED Editorial",
    published: "2026-08-23",
    updated: "2026-08-25",
    pullQuote: {
      quote: "The second cohort reveals whether the first cohort built a program or merely completed a project.",
      attribution: "AP MED operating principle",
    },
    supporting: {
      label: "Second-cohort handoff",
      title: "Leave an operating record, not a folder of memories",
      body: "Before closing the cycle, document the rules and manual decisions that shaped the program. The goal is not perfect documentation; it is enough context for the next team to repeat and improve the work.",
      items: [
        "Final eligibility and matching rules",
        "Reasons administrators overrode recommended matches",
        "Messages and reminders that changed participant behavior",
        "Reporting definitions used with partners or funders",
      ],
    },
    sections: [
      {
        id: "outcome",
        number: "01",
        title: "Define one program outcome",
        paragraphs: [
          "Start with the change the program should create, not the number of pairs you want to announce. A useful outcome might be stronger professional confidence, better access to specialty guidance, improved transition into training, or greater connection to an association.",
          "The outcome should shape who participates, what a good match means, how long relationships run, and which activities the program supports. A program with six unrelated goals usually becomes a directory with extra administration.",
        ],
        callout: { label: "A practical test", text: "If the team cannot explain why the program exists in one sentence, it is too early to choose software or open applications." },
      },
      {
        id: "program-model",
        number: "02",
        title: "Design the operating model on paper",
        paragraphs: [
          "Map the full lifecycle: recruit, apply, review, match, orient, support, measure, and close or renew. Assign an owner to each step and identify the decisions that require a board, faculty member, partner, or administrator.",
          "Decide whether the program is open enrollment or selective, one-to-one or group-based, fixed-term or always-on, and whether participants may hold several relationships. These are program rules first and software settings second.",
        ],
        bullets: [
          "Participant roles and eligibility",
          "Application and review process",
          "Matching criteria and approval authority",
          "Program duration and expected meeting cadence",
          "Orientation, milestones, goals, and resources",
          "Rematch, withdrawal, and escalation procedures",
          "Data access, retention, consent, and reporting",
        ],
      },
      {
        id: "recruitment",
        number: "03",
        title: "Recruit for balance, not just volume",
        paragraphs: [
          "A program can collect hundreds of applications and still fail if mentor supply does not align with participant needs. Track likely demand by pathway, specialty, experience, geography, and support area before promising a match to everyone.",
          "Recruitment copy should state the commitment clearly. Mentors need to know the expected cadence and duration. Mentees need to understand their role in scheduling, preparation, and follow-through.",
        ],
      },
      {
        id: "matching-launch",
        number: "04",
        title: "Match deliberately and launch with structure",
        paragraphs: [
          "Use a repeatable matching policy and retain administrator review for edge cases. Explain the factors considered without promising perfect compatibility. A match is a starting hypothesis, not a guarantee.",
          "The launch should give both parties the same expectations, contact path, first-meeting agenda, program calendar, support contact, and a clear way to report that the match is not workable.",
        ],
        table: {
          headers: ["Launch asset", "Purpose"],
          rows: [
            ["Introduction message", "Creates a trusted handoff and confirms the program context"],
            ["First-meeting guide", "Reduces uncertainty and helps pairs establish goals"],
            ["Program calendar", "Makes milestones, surveys, and key dates visible"],
            ["Support and rematch policy", "Gives participants a safe path when the relationship stalls"],
          ],
        },
      },
      {
        id: "measure-repeat",
        number: "05",
        title: "Measure enough to improve the next cohort",
        paragraphs: [
          "Track inputs, activity, participant experience, and outcomes separately. Applications and matches describe reach. Meetings, goals, and milestones describe activity. Surveys describe experience. The program's original outcome determines whether the initiative made a meaningful difference.",
          "Close the cohort with a short operational review. Which recruitment channels worked? Where did matches fail? Which reminders helped? What did administrators do manually? Those answers become the requirements for the next cycle and prevent the program from rebuilding itself from memory.",
        ],
      },
    ],
    related: ["mentor-matching-software-what-to-look-for", "best-mentoring-platforms-for-healthcare-organizations"],
  },
];

export function getBlogPost(slug: string) {
  return blogPosts.find((post) => post.slug === slug);
}

export function getBlogReadingTime(post: BlogPost) {
  const sectionText = post.sections.flatMap((section) => [
    section.title,
    ...section.paragraphs,
    ...(section.bullets ?? []),
    ...(section.callout ? [section.callout.label, section.callout.text] : []),
    ...(section.table ? [...section.table.headers, ...section.table.rows.flat()] : []),
  ]);
  const text = [
    post.title,
    post.description,
    post.intro,
    post.pullQuote.quote,
    post.supporting.label,
    post.supporting.title,
    post.supporting.body,
    ...post.supporting.items,
    ...sectionText,
  ].join(" ");
  const words = text.trim().split(/\s+/).filter(Boolean).length;
  return `${Math.max(1, Math.ceil(words / 200))} min read`;
}
