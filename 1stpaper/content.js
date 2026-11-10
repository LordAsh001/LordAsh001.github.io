// 1stPaper — guide content and reference lists (CC BY 4.0)
(function () {
  const L = (window.FIRSTPAPER_CONFIG || {}).links || {};

  const STEPS = [
    {
      key: 'idea', title: 'Find a publishable idea', short: 'Idea',
      why: 'Most first papers do not start from scratch. They come from work you have already done, or from questions you can answer with literature and open data alone.',
      actions: [
        'List work you have already done: final-year project, MSc thesis, seminar paper, internship report, field data',
        'For each, ask: is there one clear finding someone else in my field would want to read?',
        'If you have no data, consider a review, a bibliometric study, or analysis of an open dataset',
        'Write your idea as one sentence: "This paper shows / reviews / tests …"',
        'Check that a similar paper has not already been published in the last 2–3 years'
      ],
      tips: [
        'A thesis is usually too long for one paper. Pick the strongest chapter or finding.',
        'Open data sources: FAO, World Bank, DHS, national statistics bureaus, NASA/ESA satellite data, Our World in Data.',
        'If you co-did your project with a supervisor, they should normally be a co-author. Talk to them first.'
      ],
      pitfalls: ['Choosing a topic so broad it needs a book, not a paper', 'Re-publishing a thesis word-for-word without permission from your institution'],
      links: [{ label: 'Our World in Data', url: 'https://ourworldindata.org/' }, { label: 'FAOSTAT', url: 'https://www.fao.org/faostat/' }]
    },
    {
      key: 'type', title: 'Pick your article type', short: 'Type',
      why: 'Journals publish different kinds of articles. Matching your idea to the right type decides the length, structure and journals you can target.',
      actions: [
        'Decide which type fits your idea (see the list below)',
        'Find two published examples of that type in your field and save them as models',
        'Note the typical word count and section headings in those examples'
      ],
      tips: [
        'Original research: new data and results (usually 4,000–8,000 words).',
        'Review (narrative, scoping or systematic): summarises and critiques existing studies. Systematic reviews follow PRISMA.',
        'Short communication: one focused finding (often 2,000–3,500 words). A good first paper.',
        'Case study: a detailed account of one site, project, community or event.',
        'Data paper: describes a dataset you collected so others can reuse it.'
      ],
      pitfalls: ['Calling a casual literature summary a "systematic review"'],
      links: [{ label: 'PRISMA (systematic reviews)', url: 'https://www.prisma-statement.org/' }]
    },
    {
      key: 'lit', title: 'Search and read the literature', short: 'Literature',
      why: 'Reviewers reject papers that ignore recent work. You need to know what is already known, so you can show what is new in yours.',
      actions: [
        'Pick 3–5 search keywords and their synonyms',
        'Search Google Scholar, Semantic Scholar, and any databases you can reach',
        'Use LARA to request articles you cannot access',
        'Keep every source in a reference manager (Zotero is free)',
        'Write a 2–3 line note on each important paper: what they did, what they found, what is missing'
      ],
      tips: [
        'Focus on the last 5–10 years, plus a few classic papers.',
        'Read the "future work" and "limitations" parts of recent papers. They point straight at gaps.',
        'Learn how to search, cite and annotate in Citadel.'
      ],
      pitfalls: ['Citing papers you have not read', 'Relying mostly on sources from predatory journals'],
      links: [{ label: 'LARA — get articles', url: L.lara }, { label: 'Citadel — citation and annotation', url: L.citadel }, { label: 'Zotero', url: 'https://www.zotero.org/' }, { label: 'Semantic Scholar', url: 'https://www.semanticscholar.org/' }]
    },
    {
      key: 'question', title: 'Define the gap and research question', short: 'Question',
      why: 'A clear research question is the spine of the paper. Every section should serve it.',
      actions: [
        'Write the gap in one sentence: "Little is known about X in context Y because …"',
        'Turn it into one main research question (and up to 3 objectives)',
        'Check that your data or method can actually answer it',
        'Share it with your group or mentor for feedback'
      ],
      tips: ['Good questions are specific about place, population, time or material.', 'Citadel has guidance on aims, objectives and research questions.'],
      pitfalls: ['Questions that cannot be answered with the data you have'],
      links: [{ label: 'Citadel — aims and questions', url: L.citadel }]
    },
    {
      key: 'methods', title: 'Plan methods and ethics', short: 'Methods',
      why: 'Reviewers must be able to repeat what you did. Ethics problems can get a paper rejected or retracted, even after publication.',
      actions: [
        'Write down every step of your method in enough detail for someone else to repeat it',
        'Choose your analysis (statistics, software, coding scheme) before you look at results',
        'If your study involves people (surveys, interviews, health records), get ethics approval or confirm exemption',
        'Keep raw data, cleaned data and analysis scripts in an organised folder',
        'Plan where you will share data (e.g. Zenodo) if the journal asks'
      ],
      tips: [
        'No institution to give ethics approval? Stick to reviews, open data and desk studies until a group member\'s institution can help.',
        'Free tools: R, Python, JASP, QGIS.'
      ],
      pitfalls: ['Collecting human data without consent or approval', 'Changing your analysis after seeing the results to get a "significant" finding'],
      links: [{ label: 'Zenodo (share data)', url: 'https://zenodo.org/' }, { label: 'JASP (free statistics)', url: 'https://jasp-stats.org/' }]
    },
    {
      key: 'authorship', title: 'Agree authorship early', short: 'Authorship',
      why: 'Authorship disputes are the most common reason research groups fall apart. Agree before the writing starts, and write it down.',
      actions: [
        'Agree who does what, using CRediT contributor roles',
        'Agree the author order and the corresponding author',
        'Agree what happens if someone stops contributing',
        'Everyone accepts the group agreement on 1stPaper',
        'Every author creates an ORCID iD'
      ],
      tips: [
        'Authors must make a real intellectual contribution AND approve the final paper (ICMJE criteria).',
        'People who only helped a little go in the Acknowledgements, not the author list.',
        'Revisit the order if roles change. Changes are normal; secret changes are not.'
      ],
      pitfalls: ['Adding someone as an author because of their title, or in exchange for money or favours', 'Leaving out someone who did real work'],
      links: [{ label: 'CRediT roles', url: 'https://credit.niso.org/' }, { label: 'ORCID — get your iD', url: 'https://orcid.org/register' }, { label: 'COPE authorship guidance', url: 'https://publicationethics.org/' }]
    },
    {
      key: 'draft', title: 'Write the first draft', short: 'Draft',
      why: 'Most research papers follow IMRaD: Introduction, Methods, Results and Discussion. Writing in the right order makes it much easier.',
      actions: [
        'Write Methods first (you already know what you did)',
        'Then Results: figures and tables first, then text describing them',
        'Then Discussion: what the results mean, how they compare with other studies, limitations',
        'Then Introduction: background, gap, question',
        'Last: Conclusion, Abstract and Title',
        'Format references with your reference manager, not by hand'
      ],
      tips: [
        'One paragraph = one idea. Start each paragraph with its main point.',
        'Use the past tense for what you did, and the present tense for what is generally known.',
        'Read your draft aloud. Long sentences you stumble over need splitting.',
        'Citadel walks through each IMRaD section in detail.'
      ],
      pitfalls: ['Copying sentences from other papers, even with a citation (plagiarism)', 'Presenting AI-generated text as your own without checking the journal\'s AI policy'],
      links: [{ label: 'Citadel — IMRaD and academic writing', url: L.citadel }]
    },
    {
      key: 'journal', title: 'Choose a legitimate journal', short: 'Journal',
      why: 'A paper in a predatory journal can hurt your applications. Admissions panels and scholarship reviewers notice.',
      actions: [
        'Use LARA\'s Find a Journal to shortlist 3 journals that publish your article type and topic',
        'Check each one is indexed in Scopus, Web of Science or DOAJ',
        'Check the fees. Look for diamond open-access journals (no fees) or waivers for your country',
        'Read the aims and scope and a few recent articles',
        'Rank your three: aim high first, with a realistic backup'
      ],
      tips: [
        'Warning signs: guaranteed acceptance, review in days, spam invitations, fake impact factors, vague editorial board.',
        'Many publishers waive fees for authors from Research4Life countries.',
        'Use the Think. Check. Submit. checklist on every journal.'
      ],
      pitfalls: ['Choosing a journal because it emailed you', 'Paying a fee before your paper has been peer reviewed'],
      links: [{ label: 'LARA — Find a Journal', url: L.findJournal }, { label: 'Think. Check. Submit.', url: 'https://thinkchecksubmit.org/' }, { label: 'DOAJ', url: 'https://doaj.org/' }, { label: 'Research4Life', url: 'https://www.research4life.org/' }]
    },
    {
      key: 'submit', title: 'Polish and submit', short: 'Submit',
      why: 'Editors decide in minutes whether to send a paper out for review. A clean, well-formatted submission gets a fair reading.',
      actions: [
        'Format the paper to the journal\'s Guide for Authors (word count, headings, reference style, figures)',
        'Ask someone outside the group to read it',
        'Write a short cover letter: what you found, why it matters, why this journal',
        'Prepare declarations: conflicts of interest, funding, data availability, author contributions (CRediT)',
        'Every author approves the final version',
        'Submit, and save the confirmation email'
      ],
      tips: [
        'Consider posting a preprint (e.g. AfricArXiv) if the journal allows it. You can list it on applications straight away.',
        'Suggest 3–5 independent reviewers if asked, never friends or co-authors.'
      ],
      pitfalls: ['Submitting the same paper to two journals at once', 'Ignoring the journal\'s formatting rules'],
      links: [{ label: 'AfricArXiv (preprints)', url: 'https://africarxiv.org/' }]
    },
    {
      key: 'review', title: 'Handle peer review', short: 'Review',
      why: 'Almost every accepted paper goes through at least one round of revisions. Rejection is normal, even for experienced researchers.',
      actions: [
        'Read the reviews, then wait a day before responding',
        'Make a table: each reviewer comment, your response, and where you changed the paper',
        'Make every reasonable change; politely explain with evidence where you disagree',
        'Mark changes in the manuscript (tracked changes or highlight)',
        'If rejected, use the comments to improve it and submit to your next journal'
      ],
      tips: ['Thank reviewers once at the start, not in every reply.', 'Respond to every point, even small ones.'],
      pitfalls: ['Arguing emotionally with reviewers', 'Resubmitting a rejected paper elsewhere without fixing the problems raised'],
      links: []
    },
    {
      key: 'after', title: 'After acceptance', short: 'Published',
      why: 'Acceptance is the start of your paper\'s life. Make sure people, and scholarship committees, can find it.',
      actions: [
        'Check the proofs carefully, especially names, affiliations, figures and numbers',
        'Add the paper to your ORCID record and CV with its DOI',
        'Share it: LinkedIn, ResearchGate, your institution, your group on 1stPaper',
        'Mark your group as published on 1stPaper',
        'Plan the next paper. The second one is much easier'
      ],
      tips: ['On applications, list it with full citation and DOI. Use "Under review at [journal]" only for papers actually under review.', 'Use Laureate Lab to turn your publication into a stronger scholarship application.'],
      pitfalls: ['Listing papers as "accepted" before you have the acceptance letter'],
      links: [{ label: 'Laureate Lab', url: L.laureate }, { label: 'ORCID', url: 'https://orcid.org/' }]
    }
  ];

  const FIELDS = ['Agriculture & Food', 'Biological Sciences', 'Business & Management', 'Chemistry', 'Computer Science & IT', 'Earth & Environmental Sciences', 'Economics', 'Education', 'Engineering', 'Health & Medical Sciences', 'Humanities & Languages', 'Law', 'Mathematics & Statistics', 'Physics', 'Social Sciences', 'Other'];

  const ARTICLE_TYPES = ['Original research', 'Systematic or scoping review', 'Narrative review', 'Short communication', 'Case study', 'Data paper', 'Not sure yet'];

  const SKILLS = ['Literature searching', 'Systematic review', 'Statistics', 'R', 'Python', 'GIS / mapping', 'Qualitative analysis', 'Survey design', 'Laboratory work', 'Field data collection', 'Modelling / simulation', 'Academic writing', 'Editing & proofreading', 'Data visualisation', 'Reference management', 'Translation'];

  const CREDIT = ['Conceptualization', 'Data curation', 'Formal analysis', 'Funding acquisition', 'Investigation', 'Methodology', 'Project administration', 'Resources', 'Software', 'Supervision', 'Validation', 'Visualization', 'Writing – original draft', 'Writing – review & editing'];

  const AGREEMENT = `1. Authorship follows contribution. We record our roles using CRediT and agree the author order before drafting. We revisit it if roles change.
2. Every author must contribute real work AND approve the final manuscript before submission.
3. No one is added as an author for their title, for money, or as a favour. Authorship is never bought or sold.
4. If a member stops contributing for 4 weeks without explanation, the group may move them to the Acknowledgements.
5. We do not plagiarise, fabricate or manipulate data, and we follow ethics rules for any human or animal data.
6. We submit only to legitimate journals and never to two journals at once.
7. Ideas and data shared in this group stay in the group unless everyone agrees otherwise.`;

  window.FP_CONTENT = { STEPS, FIELDS, ARTICLE_TYPES, SKILLS, CREDIT, AGREEMENT };
})();
