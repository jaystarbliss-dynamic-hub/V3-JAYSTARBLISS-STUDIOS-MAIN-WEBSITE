import assert from 'node:assert/strict';
import test from 'node:test';

import {
  CORE_PARTNERSHIP_PROGRAMME_IDS,
  CORE_PARTNERSHIP_PROGRAMMES,
} from '../src/data/learningEcosystem.ts';
import {
  PORTAL_BILLING_ROUTES,
  formatAgreementCategoryLabel,
  getPortalBillingRoute,
} from '../src/lib/portalRoutes.ts';
import {
  buildPerformanceReportTemplate,
  buildCommuniqueTemplate,
  buildProposalTemplate,
  buildContractTemplate,
  extractPlainTextFromHtml,
} from '../src/lib/documents/documentTemplates.ts';

test('School partnership programmes are restricted strictly to the 4 core programmes', () => {
  assert.equal(CORE_PARTNERSHIP_PROGRAMME_IDS.length, 4);
  assert.equal(CORE_PARTNERSHIP_PROGRAMMES.length, 4);

  const ids = CORE_PARTNERSHIP_PROGRAMMES.map((p) => p.id);
  assert.deepEqual(ids, [
    'tech-programming',
    'digital-literacy',
    'creative-design',
    'music-performing-arts',
  ]);

  const forbiddenNames = [
    'School of Academic Excellence',
    'School of Strategy & Games',
    'School of Young Creators',
    'School ICT Lab Transformation',
  ];
  for (const prog of CORE_PARTNERSHIP_PROGRAMMES) {
    for (const forbidden of forbiddenNames) {
      assert.equal(
        prog.name.toLowerCase().includes(forbidden.toLowerCase()),
        false,
        `Unexpected legacy programme found: ${prog.name}`
      );
    }
  }
});

test('Portal billing routes direct parents to /portal/parent/payments and never /portal/parent/billing', () => {
  assert.equal(PORTAL_BILLING_ROUTES.parent, '/portal/parent/payments');
  assert.equal(getPortalBillingRoute('parent'), '/portal/parent/payments');
  assert.equal(getPortalBillingRoute('PARENT'), '/portal/parent/payments');
  assert.equal(getPortalBillingRoute('guardian'), '/portal/parent/payments');
  assert.equal(getPortalBillingRoute('school'), '/portal/school/payments');
  assert.equal(getPortalBillingRoute('student'), '/portal/student/payments');
  assert.equal(getPortalBillingRoute('staff'), '/portal/staff/payments');
});

test('Agreement category terminology renders Communiqué / Communiqués while preserving COMMUNICATION enum', () => {
  assert.equal(formatAgreementCategoryLabel('COMMUNICATION', false), 'Communiqué');
  assert.equal(formatAgreementCategoryLabel('COMMUNICATION', true), 'Communiqués');
  assert.equal(formatAgreementCategoryLabel('COMMUNIQUE', false), 'Communiqué');
  assert.equal(formatAgreementCategoryLabel('PROPOSAL', false), 'Proposal');
  assert.equal(formatAgreementCategoryLabel('PROPOSAL', true), 'Proposals');
  assert.equal(formatAgreementCategoryLabel('CONTRACT', false), 'Contract / Agreement');
  assert.equal(formatAgreementCategoryLabel('CONTRACT', true), 'Contracts / Agreements');
});

test('Official Document Studio templates generate rich structured sections for reports and admin documents', () => {
  const perfHtml = buildPerformanceReportTemplate({
    studentName: 'Adaeze Okonkwo',
    programmeName: 'School of Technology & Programming',
    reportingPeriod: 'Mid-Term Check-in',
    tutorName: 'Daniel Okafor',
  });
  assert.ok(perfHtml.includes('Adaeze Okonkwo'));
  assert.ok(perfHtml.includes('School of Technology &amp; Programming') || perfHtml.includes('School of Technology & Programming'));
  assert.ok(perfHtml.includes('<table'));

  const communiqueHtml = buildCommuniqueTemplate({
    recipientName: 'St. Mary Academy',
    authorName: 'Academic Operations',
  });
  assert.ok(communiqueHtml.includes('St. Mary Academy'));

  const proposalHtml = buildProposalTemplate({ recipientName: 'Greenfield High' });
  assert.ok(proposalHtml.includes('Greenfield High'));

  const contractHtml = buildContractTemplate({ recipientName: 'Greenfield High' });
  assert.ok(contractHtml.includes('Greenfield High'));

  const plain = extractPlainTextFromHtml('<h2>Progress Update</h2><p>Strong improvement in Python.</p>');
  assert.ok(plain.includes('Progress Update'));
  assert.ok(plain.includes('Strong improvement in Python.'));
});
