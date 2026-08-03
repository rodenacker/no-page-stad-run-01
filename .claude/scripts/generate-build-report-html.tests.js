#!/usr/bin/env node
/**
 * Tests for generate-build-report-html.js — the safe markdown-lite renderer and
 * page assembly. The renderer must never let raw HTML from journals / the insight
 * prompt reach the page, and must join hard-wrapped paragraphs so **bold** that
 * straddles a line break still renders.
 *
 * Usage:
 *   node .claude/scripts/generate-build-report-html.tests.js
 */
'use strict';

const harness = require('./lib/test-harness');
const { assert, assertEqual, summary } = harness;
const { mdLite, renderPage } = require('./generate-build-report-html');

// ── mdLite ───────────────────────────────────────────────────────────────────
harness.test('mdLite: escapes raw HTML before formatting (no injection)', () => {
  const out = mdLite('<script>alert(1)</script> and **bold**');
  assert(!out.includes('<script>'), 'script tag escaped');
  assert(out.includes('&lt;script&gt;'), 'angle brackets entity-encoded');
  assert(out.includes('<strong>bold</strong>'), 'bold still applied after escaping');
});

harness.test('mdLite: joins a hard-wrapped paragraph so straddling bold renders', () => {
  const out = mdLite('one root cause: **something that\nspans a line break** — end.');
  assert(out.includes('<strong>something that spans a line break</strong>'), 'bold spans the wrap');
  assertEqual((out.match(/<p>/g) || []).length, 1, 'rendered as a single paragraph');
});

harness.test('mdLite: headings, bullets, and inline code', () => {
  const out = mdLite('## Heading\n\n- a bullet with `code`\n- second bullet');
  assert(out.includes('<h5>Heading</h5>'), 'h2 → h5');
  assert(out.includes('<ul>') && out.includes('</ul>'), 'list wrapper');
  assertEqual((out.match(/<li>/g) || []).length, 2, 'two list items');
  assert(out.includes('<code>code</code>'), 'inline code');
});

harness.test('mdLite: blank input yields empty string', () => {
  assertEqual(mdLite(''), '', 'empty');
  assertEqual(mdLite(null), '', 'null');
});

harness.test('mdLite: a blank line closes a list (following text is its own paragraph)', () => {
  const out = mdLite('- item\n\nafter');
  const ulEnd = out.indexOf('</ul>');
  const para = out.indexOf('<p>after</p>');
  assert(ulEnd !== -1 && para > ulEnd, 'paragraph comes after the closed list');
});

// ── renderPage ───────────────────────────────────────────────────────────────
harness.test('renderPage: non-ok status renders a message page, not a crash', () => {
  const html = renderPage({ status: 'no_project', message: 'run /start' }, null);
  assert(html.includes('run /start'), 'message shown');
  assert(/Build report/i.test(html), 'still titled');
});

harness.test('renderPage: ok payload renders overview, timeline, epics, blocks', () => {
  const data = {
    status: 'ok',
    project: { name: 'Demo' },
    generatedAt: '2026-07-10T10:00:00Z',
    timeline: {
      firstCommit: { date: '2026-07-01T09:00:00Z', subject: 'init' },
      lastCommit: { date: '2026-07-02T09:00:00Z', subject: 'done' },
      spanDays: 2, totalCommits: 3, sessionCount: 1, activeMinutes: 90, gapMin: 45,
      sessions: [{ start: '2026-07-01T09:00:00Z', end: '2026-07-01T10:30:00Z', day: '2026-07-01', durationMin: 90, commitCount: 2, commits: [{ date: '2026-07-01T09:00:00Z', subject: 'a' }, { date: '2026-07-01T10:30:00Z', subject: 'fix b' }] }]
    },
    epics: [{
      slug: 'demo-epic', name: 'Demo Epic', status: 'complete',
      firstCommit: { date: '2026-07-01T09:00:00Z' }, lastCommit: { date: '2026-07-02T09:00:00Z' },
      sessionMinutes: 90, sharedSessions: false, commitCount: 2, fixCommitCount: 1,
      stories: { total: 2, complete: 2, passedAfterFix: 1 },
      manualTest: { outcome: 'passed', note: 'looked good', passed: 2, total: 2 },
      unverifiedAssumptions: 1, journal: '## Story 1\n- did a thing'
    }],
    coverage: { plannedEpics: 3, builtEpics: 1, storiesBuilt: 2 },
    rework: { fixCommitCount: 1, passedAfterFixStories: 1, fixCommits: [] },
    stumblingBlocks: [{ title: 'A snag', source: 'dev', summary: 's', body: '- **Issue:** it snagged' }]
  };
  const html = renderPage(data, '## The headline\n\nIt went **well**.');
  assert(html.startsWith('<!doctype html>'), 'doctype');
  assert(html.includes('Demo Epic'), 'epic name');
  assert(html.includes('A snag'), 'stumbling block title');
  assert(html.includes('What this means'), 'insight panel included when md supplied');
  assert(html.includes('<strong>well</strong>'), 'insight markdown rendered');
  assert(html.includes('1/3') || html.includes('1/3</div>'), 'epics delivered ratio shown');
});

harness.test('renderPage: omits the insight panel when no markdown supplied', () => {
  const data = {
    status: 'ok', project: { name: 'Demo' }, generatedAt: '2026-07-10T10:00:00Z',
    timeline: { firstCommit: null, lastCommit: null, spanDays: 0, totalCommits: 0, sessionCount: 0, activeMinutes: 0, gapMin: 45, sessions: [] },
    epics: [], coverage: { plannedEpics: null, builtEpics: 0, storiesBuilt: 0 },
    rework: { fixCommitCount: 0, passedAfterFixStories: 0, fixCommits: [] }, stumblingBlocks: []
  };
  const html = renderPage(data, null);
  assert(!html.includes('What this means'), 'no insight panel without markdown');
});

// ── renderBuildFlow ──────────────────────────────────────────────────────────
const flowData = {
  buildFlow: { storyMinutes: 50, wallClockMinutes: 35, parallelism: 1.43, peakInFlight: 2, overlapPct: 43 },
  epics: [
    {
      slug: 'alpha', name: 'Alpha <script>x</script>', createdAt: '2026-07-01T08:50:00Z',
      flow: {
        stories: [
          { n: 1, title: 'first & <b>bold</b> thing', startedAt: '2026-07-01T09:00:00Z', completedAt: '2026-07-01T09:20:00Z', commit: 'abc1234', e2eStatus: 'passed' },
          { n: 2, title: null, startedAt: '2026-07-01T09:21:00Z', completedAt: '2026-07-01T09:40:00Z', commit: null, e2eStatus: 'passed-after-fix' }
        ],
        wrapUp: { endedAt: '2026-07-01T09:55:00Z', commits: 2 }
      }
    },
    {
      slug: 'beta', name: 'Beta', createdAt: null,
      flow: { stories: [{ n: 1, title: 'b', startedAt: '2026-07-01T09:10:00Z', completedAt: '2026-07-01T09:25:00Z', commit: null, e2eStatus: null }], wrapUp: null }
    }
  ]
};

harness.test('renderBuildFlow: lanes, story bars, shoulders, in-flight strip, and stats', () => {
  const { renderBuildFlow } = require('./generate-build-report-html');
  const html = renderBuildFlow(flowData);
  assert(html.includes('2026-07-01'), 'day row rendered');
  assert((html.match(/class="fbar/g) || []).length === 3, 'one bar per story');
  assert((html.match(/class="fshoulder/g) || []).length === 2, 'lead (plan) and wrap-up shoulders for alpha');
  assert(html.includes('fstep'), 'in-flight strip rendered');
  assert(html.includes('1.43×'), 'parallelism stat shown');
  assert(html.includes('Table view'), 'table fallback present');
});

harness.test('renderBuildFlow: epic/story text is escaped (tooltips survive one attribute decode)', () => {
  const { renderBuildFlow } = require('./generate-build-report-html');
  const html = renderBuildFlow(flowData);
  assert(!html.includes('<script>x'), 'raw epic-name script tag never reaches the page');
  assert(html.includes('&lt;script&gt;x'), 'lane label escaped once');
  assert(html.includes('&amp;lt;script&amp;gt;'), 'tooltip attribute escaped twice (decodes to inert text)');
});

harness.test('renderBuildFlow: no story timestamps → quiet placeholder, no crash', () => {
  const { renderBuildFlow } = require('./generate-build-report-html');
  const html = renderBuildFlow({ buildFlow: null, epics: [{ slug: 'old', name: 'Old', flow: { stories: [], wrapUp: null } }] });
  assert(html.includes('No story timing recorded yet'), 'placeholder message');
});

// ── Sign-off log (stakeholders) ──────────────────────────────────────────────
// build-report-decisions.json is MODEL-AUTHORED, so the renderer treats it as untrusted input:
// a bad shape must degrade to "no section" rather than crash or emit a half-built list, and the
// authored text must be escaped like any other untrusted string reaching the page.
const { normaliseDecisions, renderSignOff, renderStakeholdersPage } = require('./generate-build-report-html');

harness.test('normaliseDecisions: groups by area in first-seen order, dates reduced to a day', () => {
  const n = normaliseDecisions({
    decisions: [
      { area: 'Project setup', decision: 'How people sign in', choice: 'Server-side sign-in', when: '2026-07-14T15:04:00Z' },
      { area: 'File logs', decision: 'What the list shows', choice: 'Newest first' },
      { area: 'Project setup', decision: 'Which backend', choice: 'The hosted test system', when: '2026-07-15' }
    ],
    excludedCount: 16
  });
  assertEqual(n.count, 3, 'all three rows kept');
  assertEqual(n.excluded, 16, 'excluded count carried through');
  assertEqual(n.groups.map((g) => g.area).join(','), 'Project setup,File logs', 'first-seen order, not alphabetical');
  assertEqual(n.groups[0].rows.length, 2, 'same area folded into one group');
  assertEqual(n.groups[0].rows[0].when, '2026-07-14', 'timestamp truncated to the date');
  assertEqual(n.groups[1].rows[0].when, '', 'a missing date is tolerated, not invented');
});

harness.test('normaliseDecisions: junk shapes yield null rather than an empty section', () => {
  assertEqual(normaliseDecisions(null), null, 'file absent');
  assertEqual(normaliseDecisions({}), null, 'no decisions key');
  assertEqual(normaliseDecisions({ decisions: 'nope' }), null, 'decisions not an array');
  assertEqual(normaliseDecisions({ decisions: [] }), null, 'empty list');
  assertEqual(normaliseDecisions({ decisions: [null, 7, { decision: 'no choice' }, { choice: 'no decision' }] }), null,
    'rows missing decision or choice are dropped, leaving nothing to render');
  const partial = normaliseDecisions({ decisions: [{ decision: 'A', choice: 'B' }, { decision: 'C' }] });
  assertEqual(partial.count, 1, 'one good row survives alongside a bad one');
  assertEqual(partial.groups[0].area, 'Other', 'missing area falls back');
  assertEqual(normaliseDecisions({ decisions: [{ decision: 'A', choice: 'B' }], excludedCount: -3 }).excluded, 0,
    'a nonsense excluded count is not shown');
  assertEqual(normaliseDecisions({ decisions: [{ decision: 'A', choice: 'B', when: 'last Tuesday' }] }).groups[0].rows[0].when, '',
    'an unparseable date is dropped rather than printed');
});

harness.test('renderSignOff: escapes authored text and discloses what was left out', () => {
  const html = renderSignOff(normaliseDecisions({
    decisions: [{ area: '<script>x</script>', decision: 'Roles & access', choice: '"Approver" only', when: '2026-07-14' }],
    excludedCount: 2
  }));
  assert(!html.includes('<script>x'), 'raw script tag never reaches the page');
  assert(html.includes('&lt;script&gt;x'), 'area escaped');
  assert(html.includes('Roles &amp; access') && html.includes('&quot;Approver&quot; only'), 'decision and choice escaped');
  assert(/A further 2 decisions/.test(html), 'excluded count disclosed so the list reads as curated');
  assert(html.includes('(2026-07-14)'), 'date shown');
  const noneExcluded = renderSignOff(normaliseDecisions({ decisions: [{ decision: 'A', choice: 'B' }], excludedCount: 0 }));
  assert(!/A further/.test(noneExcluded), 'no "further decisions" clause when nothing was excluded');
  assert(/1 decision recorded/.test(noneExcluded), 'singular wording for a single decision');
  assertEqual(renderSignOff(null), '', 'no section at all without data');
});

const stakeholderData = {
  status: 'ok',
  project: { name: 'Demo' },
  generatedAt: '2026-07-10T10:00:00Z',
  timeline: { activeMinutes: 90, spanDays: 2 },
  coverage: { plannedEpics: 2, builtEpics: 1, offPlanEpics: 0, storiesBuilt: 3 },
  codebase: { tests: { unitBlocks: 20, e2eBlocks: 8, e2eSpecs: 4 }, loc: { total: 1200 }, components: 9, routes: 5 },
  performance: { manualChecks: { pct: 100, passed: 3, total: 3 }, assumptionsOpen: 0 },
  epics: [{ slug: 'demo', name: 'Demo', status: 'complete', stories: { complete: 3 }, manualTest: { outcome: 'passed' }, journal: '- did a thing' }]
};

harness.test('renderStakeholdersPage: sign-off section sits between delivery and verification', () => {
  const html = renderStakeholdersPage(stakeholderData, null, {
    decisions: [{ area: 'Project setup', decision: 'How people sign in', choice: 'Server-side sign-in', when: '2026-07-14' }],
    excludedCount: 4
  });
  assert(html.includes('Decisions you signed off'), 'section heading present');
  assert(html.includes('How people sign in'), 'decision listed');
  assert(html.indexOf('Decisions you signed off') > html.indexOf('What was delivered'), 'after what was delivered');
  assert(html.indexOf('Decisions you signed off') < html.indexOf('How it was verified'), 'before the verification panel');
});

harness.test('renderStakeholdersPage: page still renders when the decisions file is absent or unusable', () => {
  for (const [label, input] of [['absent', undefined], ['null', null], ['junk', { decisions: {} }]]) {
    const html = renderStakeholdersPage(stakeholderData, null, input);
    assert(!html.includes('Decisions you signed off'), `no section (${label})`);
    assert(html.includes('How it was verified'), `rest of the page intact (${label})`);
  }
});

// ── Effort section (merged in from the standalone /build-report-effort page) ──
// Two rules must never regress: no dollar figures when the logs can't support them, and
// "fully loaded" always labelled as an allocation rather than a per-feature measurement.
const { renderEffort, renderPerformance } = require('./generate-build-report-html');

const effortData = (over = {}) => ({
  costComplete: true,
  totals: {
    stories: 10, epics: 3, buildMinutes: 200, medMinutes: 15,
    inStoryCost: 20, overheadCost: 80, totalCost: 100,
    overheadShare: 0.8, fullyLoadedPerStory: 10, fullyLoadedPerEpic: 33, medCost: 2
  },
  benchmarks: { costUplift: 5, timeUplift: 1.1, epicsMeasured: 3, partialEpics: 0, typicalEpic: { stories: 3, buildMinutes: 60, elapsedMinutes: 70, marginalCost: 6, loadedCost: 30 } },
  categories: [
    { cat: 'Listing / table page', short: 'listing', n: 5, medMin: 12, medCost: 3, medLoadedCost: 15, medTokens: 100 },
    { cat: 'Export', short: 'export', n: 1, medMin: 8, medCost: 1, medLoadedCost: 5, medTokens: 50 }
  ],
  epics: [{ slug: 'a', name: 'Feature A', stories: 3, storiesTotal: 3, timeComplete: true, buildMinutes: 60, elapsedMinutes: 70, marginalCost: 6, loadedCost: 30, parallel: false }],
  ambiguousShare: 0,
  parallelEpics: [],
  ...over
});

harness.test('renderEffort: absent data hides the section entirely', () => {
  assertEqual(renderEffort(null), '', 'no section without the effort data file');
});

harness.test('renderEffort: renders the benchmarks, per-feature roll-up and calculator', () => {
  const html = renderEffort(effortData());
  assert(html.includes('Effort benchmarks'), 'section heading');
  assert(html.includes('Rule of thumb by screen type'), 'per-type table');
  assert(html.includes('Listing / table page'), 'a screen type is listed');
  assert(html.includes('Size a new feature'), 'calculator present');
  assert(html.includes('Feature A'), 'per-feature roll-up row');
  assert(html.includes('class="ecalc"'), 'calculator inputs wired');
});

// Every figure on a feature row is summed over its TIMED stories. When that is a subset, the row
// is a floor, not a measurement — and the reader is about to compare it against features measured
// whole. Silently showing "2 stories · 40m" for an eight-story feature reads as a small feature.
harness.test('renderEffort: a partially timed feature is marked, not quietly understated', () => {
  const d = effortData();
  d.epics = [{ ...d.epics[0], stories: 2, storiesTotal: 8, timeComplete: false }];
  const html = renderEffort(d);
  assert(/2\/8 timed/.test(html), 'the row says how much of the feature was measured');
  assert(/8/.test(html), 'and the story count is the feature size, not the timed subset');
  assert(/stories without recorded times/i.test(html), 'with a note above the table explaining it');
});

harness.test('renderEffort: a fully timed feature carries no partial-coverage marker', () => {
  const html = renderEffort(effortData());
  assert(!/timed<\/span>/.test(html), 'no marker when every story has times');
  assert(!/stories without recorded times/i.test(html), 'and no note above the table');
});

// A benchmark resting on a single fully timed feature is one feature's figures wearing the word
// "typical". The generator already excludes partial epics from the median, so the tile has to
// admit how thin the sample is rather than presenting it with the same confidence as a real one.
harness.test('renderEffort: a one-feature benchmark says it is indicative', () => {
  const html = renderEffort(effortData({
    benchmarks: { costUplift: 5, timeUplift: 1.1, epicsMeasured: 1, partialEpics: 2, typicalEpic: { stories: 3, buildMinutes: 60, elapsedMinutes: 70, marginalCost: 6, loadedCost: 30 } }
  }));
  assert(/one fully timed feature/i.test(html), 'the tile qualifies the median');
});

// renderEffort is exported and takes the raw effort shape, so a file written by an older
// generator — or pooled from another project — must degrade to em dashes. It used to reach
// straight for totals.medMinutes.toFixed(0), which throws inside the page template and costs the
// reader the WHOLE report rather than one section.
harness.test('renderEffort: a partial effort shape degrades instead of throwing', () => {
  const html = renderEffort({ costComplete: true, totals: {}, benchmarks: null, categories: [], epics: [] });
  assert(typeof html === 'string' && html.includes('Effort benchmarks'), 'section still renders');
  assert(!/NaN|undefined/.test(html), 'and no NaN or undefined leaks into a tile');
});

harness.test('renderEffort: missing collections degrade instead of throwing', () => {
  const html = renderEffort({ costComplete: false, totals: { medMinutes: 5, buildMinutes: 10, stories: 2 } });
  assert(typeof html === 'string', 'no throw with categories and epics absent entirely');
  assert(!/NaN|undefined/.test(html), 'no NaN or undefined in the output');
});

harness.test('renderEffort: costComplete false renders time only — never a dollar figure', () => {
  const html = renderEffort(effortData({ costComplete: false, rate: 18 }));
  assert(html.includes('Time only'), 'states why cost is absent');
  assert(!html.includes('$'), 'no dollar figure anywhere when cost is unreconstructable');
  assert(!/R\d/.test(html), 'and no ZAR figure either, even with a rate supplied');
  assert(html.includes('Rule of thumb by screen type'), 'time-based tables still render');
  assert(html.includes('Size a new feature'), 'calculator still estimates time');
});

// The panel above this section leads with ZAR. Quoting USD here put two currencies for the same
// build on one page, with the sizing calculator — the figure anyone actually quotes — in the
// wrong one, even though build-report-procedure.md passes --rate to both generators.
harness.test('renderEffort: the rate reaches every cost figure, including the calculator', () => {
  const html = renderEffort(effortData({ rate: 18 }));
  assert(/R540\b/.test(html), 'the typical-feature tile leads with ZAR (30 × 18)');
  assert(/R270\b/.test(html), 'the per-type table converts too (15 × 18)');
  assert(html.includes('var RATE = 18'), 'and the calculator is given the rate');
});

harness.test('renderEffort: no rate falls back to USD alone, not a bare "R"', () => {
  const html = renderEffort(effortData({ rate: null }));
  assert(html.includes('$30.00'), 'USD still rendered');
  assert(!/R\d/.test(html), 'no ZAR figures without a rate');
  assert(html.includes('var RATE = null'), 'the calculator is told there is no rate');
});

// The rate reaches the effort data only if whoever ran the procedure remembered --rate on the
// SECOND generator too. An instruction in a markdown file is not a guarantee, and missing it put
// this section in dollars while the two panels above it were in rand — on the same build.
harness.test('renderEffort: falls back to the cost data rate when the effort run had none', () => {
  const html = renderEffort(effortData({ rate: null }), [], 18);
  assert(/R540\b/.test(html), 'the cost panel rate is used rather than dropping to USD alone');
  assert(html.includes('var RATE = 18'), 'and the calculator gets it too');
  // Its own rate still wins — the fallback is a floor, not an override.
  assert(/R1,080\b/.test(renderEffort(effortData({ rate: 36 }), [], 18)), 'an explicit effort rate is not overridden');
  // Nothing to fall back to leaves it in USD rather than inventing a rate.
  assert(!/R\d/.test(renderEffort(effortData({ rate: null }), [], null)), 'no rate anywhere stays USD-only');
});

// Third honesty rule, alongside costComplete and the allocation label: a model priced by
// fallback makes every dollar figure here approximate, and this section is on open display
// while the cost generator's equivalent note sits inside the collapsed Spend detail fold.
harness.test('renderEffort: fallback-priced models are disclosed on the section itself', () => {
  const html = renderEffort(effortData({ pricingEstimated: true, unknownModels: ['claude-unreleased-9'] }));
  assert(/Cost figures are estimates/.test(html), 'the caveat is stated');
  assert(html.includes('claude-unreleased-9'), 'and names the unpriced model');
  assert(!/Cost figures are estimates/.test(renderEffort(effortData())), 'silent when every model is priced');
  // pricingEstimated with an empty model list still has to say something.
  assert(/isn't in the report's price list/.test(renderEffort(effortData({ pricingEstimated: true }))), 'degrades to a generic sentence');
  // Nothing to disclose when there are no cost figures on the page to be wrong.
  assert(!/estimates/i.test(renderEffort(effortData({ costComplete: false, pricingEstimated: true }))), 'not shown in time-only mode');
});

harness.test('renderEffort: tokens and the elapsed uplift are rendered, not just carried', () => {
  const html = renderEffort(effortData());
  assert(html.includes('~ Tokens'), 'the per-type token column is shown');
  assert(html.includes('Allowing for the gaps between stories (1.10×)'), 'timeUplift reaches the calculator');
  assert(html.includes('ecalcElapsed'), 'and has an output cell');
  // A 1.0 uplift means no measured gaps — an "≈ same" row would be noise.
  assert(!renderEffort(effortData({
    benchmarks: { costUplift: 5, timeUplift: 1, typicalEpic: { stories: 3, buildMinutes: 60, elapsedMinutes: 60, marginalCost: 6, loadedCost: 30 } }
  })).includes('ecalcElapsed'), 'suppressed when there are no gaps to account for');
});

harness.test('renderEffort: the per-feature markers from the retired epic bars survive', () => {
  const html = renderEffort(effortData(), [
    { slug: 'a', fixCommitCount: 3, sharedSessions: true }
  ]);
  assert(html.includes('3 fix'), 'fix-commit count carried onto the feature row');
  assert(/Commit sessions shared with an interleaved epic/.test(html), 'and the interleaved-epic marker');
  // Not a bare 'fix' check: the "measured vs fully loaded" banner mentions epic-end fixes.
  assert(!renderEffort(effortData(), []).includes('3 fix'), 'nothing shown when git data is absent');
});

// Category names are a closed set today, so this is defence in depth — but it is the one place
// the page injects JSON into a <script>, and the retired cost template escaped as policy.
harness.test('renderEffort: data injected into the calculator script cannot close the tag', () => {
  const html = renderEffort(effortData({
    categories: [{ cat: 'Listing</script><script>alert(1)', short: 'x', n: 5, medMin: 12, medCost: 3, medLoadedCost: 15, medTokens: 100 }]
  }));
  assert(!html.includes('</script><script>alert(1)'), 'the raw sequence never reaches the page');
  assert(html.includes('\\u003c/script>'), 'it is escaped as \\u003c inside the data literal');
});

harness.test('renderEffort: fully-loaded cost is labelled an allocation, not a measurement', () => {
  const html = renderEffort(effortData());
  assert(/allocation/i.test(html), 'the pro-rata split is called an allocation');
  assert(html.includes('Measured vs fully loaded'), 'the distinction is spelled out');
});

harness.test('renderEffort: a thin sample size and parallel builds are both flagged', () => {
  const html = renderEffort(effortData({ ambiguousShare: 0.47, parallelEpics: ['a', 'b'] }));
  assert(html.includes('n=1'), 'single-measurement type is flagged');
  assert(html.includes('47% of story spend'), 'parallel-attribution banner shown above 5%');
  assert(html.includes('(a, b)'), 'and it names the features whose split is approximate');
  assert(!renderEffort(effortData()).includes('of story spend ran with'), 'banner absent when unambiguous');
});

// Overlap has two causes and only one of them softens a per-feature figure. The generator
// distinguishes them (see generate-build-effort.tests.js); this is the page's half of that rule.
// It moved here when the standalone effort page was retired — without it, the banner regresses
// to printing an empty "()" for same-feature overlap and claiming a parallel build that never
// happened.
harness.test('renderEffort: overlap inside one feature never claims a parallel build', () => {
  const html = renderEffort(effortData({ ambiguousShare: 0.47, parallelEpics: [] }));
  // Scoped to the banner: the section also embeds the calculator's JS, where `()` is ordinary.
  const banner = (html.match(/<p class="muted"[^>]*>(?:(?!<\/p>).)*of story spend ran with(?:(?!<\/p>).)*<\/p>/s) || [''])[0];
  assert(banner, 'the overlap is still disclosed');
  assert(banner.includes('47% of story spend'), 'with its share');
  assert(!/\(\s*\)/.test(banner), 'never an empty list of parallel features');
  assert(banner.includes('inside a single feature'), 'the page names the real cause instead');
  assert(!/treat the per-feature split/.test(banner), 'and does not soften a per-feature figure that holds');
});

harness.test('renderPerformance: per-epic time bars yield to the effort table when it exists', () => {
  const base = {
    performance: { e2eFirstPass: { total: 4, passed: 3, pct: 75 }, assumptionsOpen: 0 },
    epics: [{ slug: 'a', name: 'A', sessionMinutes: 30, fixCommitCount: 0, sharedSessions: false }]
  };
  const withEffort = renderPerformance({ ...base, effort: effortData() });
  const without = renderPerformance({ ...base, effort: null });
  assert(!withEffort.includes('Active time by epic'), 'commit-derived bars dropped when timestamps are available');
  assert(without.includes('Active time by epic'), 'bars retained as the fallback with no effort data');
});

// Coverage is per-EPIC, not per-project: the effort data only carries epics whose stories have
// startedAt/completedAt. Dropping the bars on mere presence of effort data erased every
// untimestamped epic's time from the page on a project that has both kinds.
harness.test('renderPerformance: epics the effort table cannot measure keep their bars', () => {
  const html = renderPerformance({
    performance: { e2eFirstPass: { total: 4, passed: 3, pct: 75 }, assumptionsOpen: 0 },
    epics: [
      { slug: 'a', name: 'Alpha', sessionMinutes: 30, fixCommitCount: 0, sharedSessions: false },
      { slug: 'legacy', name: 'Older epic', sessionMinutes: 90, fixCommitCount: 2, sharedSessions: false }
    ],
    effort: effortData() // covers 'a' only
  });
  assert(html.includes('Active time by epic'), 'the uncovered epic still gets a bar');
  assert(html.includes('Older epic'), 'and it is the uncovered one');
  assert(!html.includes('Alpha'), 'the epic the effort table measures is not duplicated here');
  assert(/not fully timed/i.test(html), 'the heading and note say which epics these are');
});

// Coverage is per-STORY, not per-epic: ONE timed story puts an epic in the effort data, so keying
// the split off mere presence dropped the commit-clustered bar for an epic whose effort figure
// covers a fraction of its stories — an in-flight epic, or one whose older stories predate the
// timestamps — erasing most of its measured time from the page with nothing to indicate it.
harness.test('renderPerformance: a partially timed epic keeps its bar rather than losing the difference', () => {
  const partial = effortData();
  partial.epics = [{ ...partial.epics[0], stories: 2, storiesTotal: 8, timeComplete: false }];
  const html = renderPerformance({
    performance: { e2eFirstPass: { total: 4, passed: 3, pct: 75 }, assumptionsOpen: 0 },
    epics: [{ slug: 'a', name: 'Alpha', sessionMinutes: 240, fixCommitCount: 0, sharedSessions: false }],
    effort: partial
  });
  assert(html.includes('Alpha'), 'the partially timed epic keeps its commit-clustered bar');
  assert(/4h/.test(html), 'showing its whole active time, not the timed stories\' share');
});

// An effort file written before storiesTotal/timeComplete existed has neither field. Those pages
// rendered with the bar dropped, so absent must keep meaning "measured" — not suddenly duplicate
// every epic's time into both sections.
harness.test('renderPerformance: effort data without the coverage fields still owns per-epic time', () => {
  const legacy = effortData();
  legacy.epics = legacy.epics.map(({ slug, name, stories }) => ({ slug, name, stories }));
  const html = renderPerformance({
    performance: { e2eFirstPass: { total: 4, passed: 3, pct: 75 }, assumptionsOpen: 0 },
    epics: [{ slug: 'a', name: 'Alpha', sessionMinutes: 240, fixCommitCount: 0, sharedSessions: false }],
    effort: legacy
  });
  assert(!html.includes('Alpha'), 'no bar — the effort table measures this epic, as before');
});

// ── Spend detail (absorbed from the standalone /build-report-cost page) ───────
// The decision log must keep three no-answer outcomes apart — answered, dismissed, never
// answered — because collapsing them would read as "the user declined", a different fact.
const { renderSpendDetail } = require('./generate-build-report-html');

const ceData = (over = {}) => ({
  usdToZar: 18,
  stallThresholdMin: 10,
  pricingEstimated: false,
  unknownModels: [],
  models: [{ model: 'claude-opus-5', costUsd: 191.53, calls: 688, output: 481025 }],
  tools: [{ tool: 'Bash', calls: 843 }, { tool: 'Read', calls: 196 }],
  agents: [
    { agent: 'orchestrator', calls: 1835, costUsd: 516.05, instances: null },
    { agent: 'developer', calls: 40, costUsd: 2.08, instances: 8 }
  ],
  decisions: [
    { phase: 'INTAKE & setup', header: 'Git handling', question: 'How should commits be handled?', answer: 'Auto-approve both', resolved: true, failed: false, waitMs: 7645, first: true, isStall: false },
    { phase: 'INTAKE & setup', header: 'Roles', question: 'Which roles exist?', answer: 'Admin only', resolved: true, failed: false, waitMs: null, first: false, isStall: false },
    { phase: 'Epic 1', header: 'Export', question: 'Include CSV export?', answer: null, resolved: false, failed: false, waitMs: null, first: true, isStall: false },
    { phase: 'Epic 2', header: 'Theme', question: 'Dark mode?', answer: null, resolved: false, failed: true, waitMs: null, first: true, isStall: false }
  ],
  ...over
});

harness.test('renderSpendDetail: absent cost data hides the section entirely', () => {
  assertEqual(renderSpendDetail(null), '', 'no section without cost data');
});

// renderCostEffort right above this one defaults every field on purpose, so a cost-data file from
// an older template version degrades instead of exploding. This section has to do the same: a
// missing key here would take the whole page down, not just hide one table.
harness.test('renderSpendDetail: a cost file with none of the detail keys degrades, never throws', () => {
  assertEqual(renderSpendDetail({ usdToZar: 18 }), '', 'nothing to show, and nothing thrown');
  const partial = renderSpendDetail({ usdToZar: 18, models: [{ model: 'm', costUsd: 1, calls: 2, output: 3 }] });
  assert(partial.includes('Model mix'), 'the one table it does have still renders');
});

// An all-zero column made the divisor 0 and every bar width NaN.
harness.test('renderSpendDetail: a zero-count tool column does not produce NaN widths', () => {
  const html = renderSpendDetail(ceData({ tools: [{ tool: 'Bash', calls: 0 }] }));
  assert(!/NaN/.test(html), 'no NaN reaches the markup');
});

harness.test('renderSpendDetail: renders model mix, tool activity and agent composition', () => {
  const html = renderSpendDetail(ceData());
  assert(html.includes('Spend detail'), 'section heading');
  assert(html.includes('Model mix'), 'model table');
  assert(html.includes('claude-opus-5'), 'a model is listed');
  assert(html.includes('Tool activity'), 'tool bars');
  assert(html.includes('Bash'), 'a tool is listed');
  assert(html.includes('Who ran the work'), 'agent table');
  assert(html.includes('main session'), 'the orchestrator has no spawn count');
  assert(html.includes('<details>'), 'folded shut — reference detail, not headline');
});

harness.test('renderSpendDetail: the decision log keeps the three no-answer outcomes distinct', () => {
  const html = renderSpendDetail(ceData());
  assert(html.includes('Auto-approve both'), 'an answered decision shows its answer');
  assert(html.includes('same dialog'), 'a follow-on question does not repeat the wait');
  assert(html.includes('never answered'), 'an unresolved question is marked, not blanked');
  assert(html.includes('dialog dismissed'), 'an aborted dialog is distinguished from unanswered');
});

// A real build asks dozens of questions; one undivided table buries the phase a reader came for.
harness.test('renderSpendDetail: the decision log is grouped per phase, in bucket order', () => {
  const html = renderSpendDetail(ceData());
  const phases = [...html.matchAll(/<summary>([^<]+)/g)].map((m) => m[1].trim());
  assertEqual(phases.join(' | '), 'INTAKE &amp; setup | Epic 1 | Epic 2', 'one fold per phase, chronological');
  assert(html.includes('2 questions'), 'the phase with two questions says so');
  assert(html.includes('1 question<'), 'and a single question is not pluralised');
  assert(!html.includes('<th>Phase</th>'), 'the phase column is gone — it is the fold label now');
  assert(html.includes('across 3 phases'), 'the caption states the phase count');
});

harness.test('renderSpendDetail: estimated pricing is surfaced, not silently absorbed', () => {
  const html = renderSpendDetail(ceData({ pricingEstimated: true, unknownModels: ['claude-unreleased-9'] }));
  assert(/estimates/i.test(html), 'says the figures are estimates');
  assert(html.includes('claude-unreleased-9'), 'names the unpriced model');
  assert(!/estimates/i.test(renderSpendDetail(ceData())), 'silent when every model is priced');
});

harness.test('renderSpendDetail: authored/verbatim decision text is escaped', () => {
  const html = renderSpendDetail(ceData({
    decisions: [{ phase: 'p', header: 'h', question: '<script>alert(1)</script>', answer: '<img onerror=x>', resolved: true, failed: false, waitMs: 1, first: true, isStall: false }]
  }));
  assert(!html.includes('<script>alert(1)</script>'), 'question escaped');
  assert(!html.includes('<img onerror=x>'), 'answer escaped');
});

// Whole-page assembly, not just the section functions. The calculator embeds a <script> built
// from nested template literals; a quoting slip there survives every unit test above and only
// breaks in a browser. This also covers the call site that hands the git epic list to
// renderEffort — the wiring, not just the renderer.
harness.test('renderPage: the maintainer page carries both new sections and valid inline JS', () => {
  const html = renderPage({
    status: 'ok', project: { name: 'Demo' }, generatedAt: '2026-07-10T10:00:00Z',
    timeline: { firstCommit: null, lastCommit: null, spanDays: 0, totalCommits: 0, sessionCount: 0, activeMinutes: 0, gapMin: 45, sessions: [] },
    epics: [{ slug: 'a', name: 'Feature A', status: 'complete', sessionMinutes: 60, sharedSessions: false, commitCount: 4, fixCommitCount: 3, stories: { total: 3, complete: 3 }, unverifiedAssumptions: 0 }],
    coverage: { plannedEpics: 1, builtEpics: 1, storiesBuilt: 3 },
    rework: { fixCommitCount: 3, passedAfterFixStories: 1, fixCommits: [] }, stumblingBlocks: [],
    costEffort: ceData(), effort: effortData({ rate: 18 })
  }, null);
  assert(html.includes('Effort benchmarks'), 'effort section on the page');
  assert(html.includes('Spend detail'), 'spend detail fold on the page');
  assert(html.includes('3 fix'), 'the git fix-commit count reached the feature row via renderPage');
  assert(/R540\b/.test(html), 'and the rate reached the effort figures');
  const scripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((m) => m[1]);
  assert(scripts.length > 0, 'the page has inline script blocks');
  for (const js of scripts) {
    try { new Function(js); } catch (e) { throw new Error(`inline script does not parse: ${e.message}`); }
  }
});

// One build, one currency, one rate — asserted on the assembled page because that is where the
// two data files meet. The cost generator always emits a rate (a fixed placeholder when it wasn't
// given one), the effort generator only emits one when it was asked; quoting each section from its
// own file put "R1,800" and "$30.00" on the same page for the same build.
const pageWith = (costEffort, effort) => renderPage({
  status: 'ok', project: { name: 'Demo' }, generatedAt: '2026-07-10T10:00:00Z',
  timeline: { firstCommit: null, lastCommit: null, spanDays: 0, totalCommits: 0, sessionCount: 0, activeMinutes: 0, gapMin: 45, sessions: [] },
  epics: [], coverage: { plannedEpics: 1, builtEpics: 1, storiesBuilt: 3 },
  rework: { fixCommitCount: 0, passedAfterFixStories: 0, fixCommits: [] }, stumblingBlocks: [],
  costEffort, effort
}, null);

harness.test('renderPage: the effort section never quotes a different currency to the cost panel', () => {
  const html = pageWith(ceData({ costUsd: 100, rateProvided: true }), effortData({ rate: null }));
  assert(/R540\b/.test(html), 'the effort figures pick up the rate the cost data carries');
  assert(/<div class="stat-v">R540<\/div><div class="stat-l">typical feature cost/.test(html),
    'the headline effort tile leads with rand, like the cost tile above it');
});

harness.test('renderPage: a placeholder exchange rate is disclosed on the page, not just warned about in the console', () => {
  const placeholder = pageWith(ceData({ costUsd: 100, rateProvided: false }), effortData({ rate: null }));
  assert(/placeholder rate/i.test(placeholder), 'the page says the rand figures rest on a made-up rate');
  assert(placeholder.includes('R18.00 per US$1'), 'and names the rate it used');
  const real = pageWith(ceData({ costUsd: 100, rateProvided: true }), effortData({ rate: 18 }));
  assert(!/placeholder rate/i.test(real), 'silent when a real rate was supplied');
});

// Three formatters had drifted to two precisions, so one build read as "R1,800.00" in the cost
// panel and "R1,800" in the fold below it.
harness.test('renderPage: every rand figure on the page uses the same precision', () => {
  const html = pageWith(ceData({ costUsd: 100, rateProvided: true }), effortData({ rate: 18 }));
  const withCents = html.match(/R[\d,]+\.\d\d(?! per US)/g) || [];
  assertEqual(withCents.length, 0, `no rand figure carries cents (found ${withCents.join(', ')})`);
});

summary();
