import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

import {
  evaluateSubscriptionState,
  buildRoleLockdownCopy,
} from '../api/_lib/subscription-core.ts';
import {
  canDeleteResource,
  buildResourceCreatorMetadata,
} from '../src/lib/resourcePermissions.ts';

const ROOT = process.cwd();

test('Manual admin lock locks an active paid account regardless of due date', () => {
  const now = new Date('2026-11-21T12:00:00.000Z');
  const evaluated = evaluateSubscriptionState({
    subscription: {
      id: 'school:sch_01',
      accountType: 'SCHOOL',
      ownerId: 'sch_01',
      ownerName: 'Excel Academy',
      billingCycle: 'MONTHLY',
      amount: 150000,
      nextDueAt: '2026-12-21T00:00:00.000Z',
      manuallyLocked: true,
      manualLockReason: 'Suspended by administration pending review.',
      manuallyUnlocked: false,
    },
    now,
  });

  assert.equal(evaluated.status, 'LOCKED');
  assert.equal(evaluated.isLocked, true);
  assert.equal(evaluated.isManuallyLocked, true);
  assert.equal(evaluated.isManuallyUnlocked, false);
  assert.equal(
    evaluated.manualLockReason,
    'Suspended by administration pending review.'
  );
});

test('Manual admin unlock opens an overdue locked account, and clearing it restores automatic unpaid lockdown', () => {
  const now = new Date('2026-11-21T12:00:00.000Z');
  const overdueBase = {
    id: 'school:sch_02',
    accountType: 'SCHOOL',
    ownerId: 'sch_02',
    ownerName: 'Heritage College',
    billingCycle: 'MONTHLY',
    amount: 200000,
    remainingBalance: 200000,
    nextDueAt: '2026-11-01T00:00:00.000Z', // 20 days past due (> 7-day grace)
  };

  // Automatic lockdown when unpaid beyond 7-day grace window
  const autoLocked = evaluateSubscriptionState({ subscription: overdueBase, now });
  assert.equal(autoLocked.status, 'LOCKED');
  assert.equal(autoLocked.isLocked, true);
  assert.equal(autoLocked.isManuallyLocked, false);

  // Admin manually opens the account
  const manuallyOpened = evaluateSubscriptionState({
    subscription: {
      ...overdueBase,
      manuallyLocked: false,
      manuallyUnlocked: true,
    },
    now,
  });
  assert.equal(manuallyOpened.status, 'ACTIVE');
  assert.equal(manuallyOpened.isLocked, false);
  assert.equal(manuallyOpened.isManuallyUnlocked, true);

  // Admin resumes automatic billing rules -> automatically locks again because overdue
  const resumedAuto = evaluateSubscriptionState({
    subscription: {
      ...overdueBase,
      manuallyLocked: false,
      manuallyUnlocked: false,
    },
    now,
  });
  assert.equal(resumedAuto.status, 'LOCKED');
  assert.equal(resumedAuto.isLocked, true);
});

test('School manual lock propagates student lockdown messaging for SCHOOL_FUNDED learners', () => {
  const copy = buildRoleLockdownCopy({
    role: 'student',
    studentFundingCategory: 'SCHOOL_FUNDED',
    schoolName: 'Excel Academy',
    isManuallyLocked: true,
    manualLockReason: 'School account paused by administration.',
    hasNonPaymentRestriction: true,
    hasPaymentRestriction: false,
  });

  assert.match(copy.headline, /YOUR SCHOOL PORTAL IS CURRENTLY UNAVAILABLE/i);
  assert.match(copy.message, /school administrator/i);
  assert.equal(copy.canPay, false);
});

test('Resource deletion policy: Admin deletes all; Tutor deletes only own; Tutor cannot delete others or admin resources', () => {
  const adminResource = {
    id: 'res_admin_1',
    _collection: 'resources',
    ...buildResourceCreatorMetadata({
      uid: 'admin_uid_1',
      email: 'admin@jaystarblissstudios.com',
      name: 'Super Admin',
      role: 'admin',
    }),
  };

  const tutorAGeneralResource = {
    id: 'res_tutor_a_1',
    _collection: 'resources',
    ...buildResourceCreatorMetadata({
      uid: 'tutor_a_uid',
      email: 'tutora@jaystarblissstudios.com',
      name: 'Tutor A',
      role: 'tutor',
    }),
  };

  const tutorBSchoolResource = {
    id: 'res_tutor_b_1',
    _collection: 'schoolResources',
    schoolId: 'school_1',
    ...buildResourceCreatorMetadata({
      uid: 'tutor_b_uid',
      email: 'tutorb@jaystarblissstudios.com',
      name: 'Tutor B',
      role: 'tutor',
    }),
  };

  // Admin can delete any resource regardless of sender
  assert.equal(
    canDeleteResource({
      resource: adminResource,
      currentUid: 'admin_uid_2',
      currentRole: 'admin',
      isAdmin: true,
    }),
    true
  );
  assert.equal(
    canDeleteResource({
      resource: tutorAGeneralResource,
      currentUid: 'admin_uid_2',
      currentRole: 'super_admin',
      isAdmin: true,
    }),
    true
  );
  assert.equal(
    canDeleteResource({
      resource: tutorBSchoolResource,
      currentUid: 'admin_uid_2',
      currentRole: 'admin',
      isAdmin: true,
    }),
    true
  );

  // Tutor A can delete their own general resource
  assert.equal(
    canDeleteResource({
      resource: tutorAGeneralResource,
      currentUid: 'tutor_a_uid',
      currentEmail: 'tutora@jaystarblissstudios.com',
      currentRole: 'staff',
    }),
    true
  );

  // Tutor A CANNOT delete Tutor B's resource
  assert.equal(
    canDeleteResource({
      resource: tutorBSchoolResource,
      currentUid: 'tutor_a_uid',
      currentEmail: 'tutora@jaystarblissstudios.com',
      currentRole: 'staff',
    }),
    false
  );

  // Tutor A CANNOT delete Admin's resource
  assert.equal(
    canDeleteResource({
      resource: adminResource,
      currentUid: 'tutor_a_uid',
      currentEmail: 'tutora@jaystarblissstudios.com',
      currentRole: 'tutor',
    }),
    false
  );

  // Student and Parent CANNOT delete resources
  assert.equal(
    canDeleteResource({
      resource: tutorAGeneralResource,
      currentUid: 'student_1',
      currentRole: 'student',
    }),
    false
  );
  assert.equal(
    canDeleteResource({
      resource: tutorAGeneralResource,
      currentUid: 'parent_1',
      currentRole: 'parent',
    }),
    false
  );
});

test('firestore.rules enforces isResourceOwner for staff/tutor delete and allows admin delete across all resource collections', () => {
  const rulesText = fs.readFileSync(path.join(ROOT, 'firestore.rules'), 'utf8');
  assert.match(rulesText, /function isResourceOwner\(data\)/);

  const requiredCollections = [
    'resources',
    'links',
    'exams',
    'schoolResources',
    'schoolLinks',
    'staffGeneralResources',
    'personalResources',
    'personalLinks',
  ];

  for (const col of requiredCollections) {
    const pattern = new RegExp(`match\\s+/${col}/\\{[^}]+\\}[\\s\\S]*?isResourceOwner\\(resource\\.data\\)`);
    assert.match(
      rulesText,
      pattern,
      `Expected firestore.rules for /${col} to enforce isResourceOwner(resource.data)`
    );
  }
});

test('PortalSupport uses real official channels, clean Support Desk title, and direct WhatsApp links', () => {
  const supportSource = fs.readFileSync(
    path.join(ROOT, 'src/pages/portal/PortalSupport.tsx'),
    'utf8'
  );

  // Must use real official contact details
  assert.match(supportSource, /\+234 913 651 8194/);
  assert.match(supportSource, /\+234 913 052 9010/);
  assert.match(supportSource, /\+234 707 763 8925/);
  assert.match(supportSource, /support@jaystarblissstudios\.com/);
  assert.match(supportSource, /Lagos, Nigeria/);
  assert.match(supportSource, /https:\/\/wa\.me\//);
  assert.match(supportSource, /Support Desk/);

  // Must NOT contain fake/old branding or placeholder numbers/addresses
  assert.doesNotMatch(supportSource, /Jaystar Support Desk/i);
  assert.doesNotMatch(supportSource, /Jstar Support Desk/i);
  assert.doesNotMatch(supportSource, /Jaystar Support Chat/i);
  assert.doesNotMatch(supportSource, /\+234 812 345 6789/);
  assert.doesNotMatch(supportSource, /\+234 901 234 5678/);
  assert.doesNotMatch(supportSource, /Lekki Phase 1/i);
  assert.doesNotMatch(supportSource, /Ikeja Coding/i);
  assert.doesNotMatch(supportSource, /window\.open/);
});
