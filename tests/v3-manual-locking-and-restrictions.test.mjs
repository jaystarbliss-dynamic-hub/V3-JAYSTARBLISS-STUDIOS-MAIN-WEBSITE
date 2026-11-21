import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

import {
  LOCK_REASON_DEFINITIONS,
  validateManualLockInput,
  validateManualUnlockInput,
  sanitizeRestrictionForUser,
  getAutomaticPaymentReasonCode,
  buildRestrictionNotificationId,
  isRestrictionActiveAt,
  isRestrictionExpiredAt,
} from '../api/_lib/restriction-core.ts';
import {
  evaluateSubscriptionState,
  buildRoleLockdownCopy,
} from '../api/_lib/subscription-core.ts';

const ROOT = process.cwd();

test('All 10 required predefined lock reason categories exist', () => {
  const requiredCodes = [
    'PAYMENT_OVERDUE',
    'SCHOOL_SUBSCRIPTION_OVERDUE',
    'PARENT_FEE_OVERDUE',
    'PROGRAMME_RENEWAL_OVERDUE',
    'ADMINISTRATIVE_RESTRICTION',
    'TEMPORARY_ACCESS_RESTRICTION',
    'ACCOUNT_UNDER_REVIEW',
    'SECURITY_REVIEW',
    'POLICY_OR_COMPLIANCE_REVIEW',
    'OTHER',
  ];

  for (const code of requiredCodes) {
    assert.ok(LOCK_REASON_DEFINITIONS[code], `Expected reason category ${code} to exist`);
  }
});

test('Mandatory lock reason validation rejects empty reason, OTHER without explanation, empty user message, and invalid expiry', () => {
  const now = new Date('2026-11-21T12:00:00.000Z');

  // Empty reason
  const missingReason = validateManualLockInput({
    reasonCode: '',
    userFacingMessage: 'Your account has been restricted pending compliance review.',
    now,
  });
  assert.equal(missingReason.valid, false);
  assert.ok(missingReason.errors.some((e) => /reason category/i.test(e)));

  // OTHER without custom reason
  const otherMissingCustom = validateManualLockInput({
    reasonCode: 'OTHER',
    customReason: '  ',
    userFacingMessage: 'Your account has been restricted pending compliance review.',
    now,
  });
  assert.equal(otherMissingCustom.valid, false);
  assert.ok(otherMissingCustom.errors.some((e) => /OTHER/i.test(e)));

  // Empty / meaningless user-facing explanation
  const shortUserMessage = validateManualLockInput({
    reasonCode: 'ADMINISTRATIVE_RESTRICTION',
    userFacingMessage: 'Locked',
    now,
  });
  assert.equal(shortUserMessage.valid, false);
  assert.ok(shortUserMessage.errors.some((e) => /user-facing/i.test(e)));

  // Past expiry date
  const pastExpiry = validateManualLockInput({
    reasonCode: 'TEMPORARY_ACCESS_RESTRICTION',
    userFacingMessage: 'Temporary access pause while records are verified.',
    expiresAt: '2026-11-20T12:00:00.000Z',
    now,
  });
  assert.equal(pastExpiry.valid, false);
  assert.ok(pastExpiry.errors.some((e) => /future|later/i.test(e)));

  // Valid payload succeeds and keeps internalAdminNote separate
  const validPayload = validateManualLockInput({
    reasonCode: 'SECURITY_REVIEW',
    userFacingMessage: 'Your account is temporarily restricted pending security verification.',
    internalAdminNote: 'CONFIDENTIAL: Ticket #SEC-994 suspicious IP login investigation',
    expiresAt: '2026-11-25T12:00:00.000Z',
    now,
  });
  assert.equal(validPayload.valid, true);
  assert.equal(validPayload.sanitized?.reasonCode, 'SECURITY_REVIEW');
  assert.equal(
    validPayload.sanitized?.internalAdminNote,
    'CONFIDENTIAL: Ticket #SEC-994 suspicious IP login investigation'
  );
});

test('Mandatory unlock reason validation rejects blank or meaningless reasons', () => {
  assert.equal(validateManualUnlockInput({ unlockReason: '' }).valid, false);
  assert.equal(validateManualUnlockInput({ unlockReason: 'ok' }).valid, false);
  assert.equal(validateManualUnlockInput({ unlockReason: 'Administrative review completed' }).valid, true);
});

test('Internal administrative notes and admin UIDs are strictly stripped by sanitizeRestrictionForUser', () => {
  const fullRecord = {
    restrictionId: 'rst_sec_01',
    targetAccountId: 'sch_01',
    targetAccountType: 'SCHOOL',
    accountName: 'Beacon High',
    schoolId: 'sch_01',
    affectedStudentIds: ['stu_1', 'stu_2'],
    affectedProgrammeIds: ['prog_1'],
    restrictionType: 'SECURITY_OR_REVIEW_RESTRICTION',
    reasonCode: 'SECURITY_REVIEW',
    customReason: null,
    userFacingMessage: 'Access is temporarily paused pending routine security verification.',
    internalAdminNote: 'TOP SECRET STAFF NOTE: Suspected shared credential abuse from Lagos IP.',
    restrictedScope: 'INSTITUTION',
    cascadesToLinkedLearners: true,
    appliedByUid: 'superadmin_uid_123',
    appliedByName: 'Chief Admin',
    appliedAt: '2026-11-21T10:00:00.000Z',
    effectiveAt: '2026-11-21T10:00:00.000Z',
    expiresAt: '2026-11-28T10:00:00.000Z',
    status: 'ACTIVE',
  };

  const sanitized = sanitizeRestrictionForUser(fullRecord);
  assert.equal(sanitized.restrictionId, 'rst_sec_01');
  assert.equal(sanitized.reasonCode, 'SECURITY_REVIEW');
  assert.equal(sanitized.userFacingMessage, fullRecord.userFacingMessage);
  assert.equal('internalAdminNote' in sanitized, false);
  assert.equal('appliedByUid' in sanitized, false);
  assert.equal(JSON.stringify(sanitized).includes('TOP SECRET STAFF NOTE'), false);
});

test('Role-aware lock messages and Pay Now visibility obey Section 3 rules for all 5 account roles', () => {
  // 1. School administrator — payment restriction => Pay Now shown
  const schoolPay = buildRoleLockdownCopy({
    role: 'school',
    schoolName: 'Beacon High',
    hasPaymentRestriction: true,
    hasNonPaymentRestriction: false,
    lockReasonCode: 'SCHOOL_SUBSCRIPTION_OVERDUE',
    amountDueNaira: 150000,
  });
  assert.equal(schoolPay.headline, 'PORTAL ACCESS RESTRICTED');
  assert.equal(schoolPay.canPay, true);
  assert.equal(schoolPay.payNowPath, '/portal/school/payments');

  // 1b. School administrator — non-payment manual restriction => NO Pay Now button
  const schoolAdminLock = buildRoleLockdownCopy({
    role: 'school',
    hasPaymentRestriction: false,
    hasNonPaymentRestriction: true,
    isManuallyLocked: true,
    lockReasonCode: 'POLICY_OR_COMPLIANCE_REVIEW',
    manualLockReason: 'Your school account is undergoing compliance verification. Contact Support.',
  });
  assert.equal(schoolAdminLock.headline, 'PORTAL ACCESS RESTRICTED');
  assert.equal(schoolAdminLock.canPay, false);
  assert.equal(schoolAdminLock.payNowPath, null);
  assert.match(schoolAdminLock.message, /compliance verification/i);

  // 2. School student — NEVER sees Pay Now button
  const schoolStudent = buildRoleLockdownCopy({
    role: 'student',
    studentFundingCategory: 'SCHOOL_FUNDED',
    hasPaymentRestriction: true,
    hasNonPaymentRestriction: false,
    lockReasonCode: 'SCHOOL_SUBSCRIPTION_OVERDUE',
  });
  assert.equal(schoolStudent.headline, 'YOUR SCHOOL PORTAL IS CURRENTLY UNAVAILABLE');
  assert.equal(schoolStudent.canPay, false);
  assert.equal(schoolStudent.payNowPath, null);
  assert.match(schoolStudent.message, /school administrator/i);

  // 3a. Individual self-funded student — payment restriction => Pay Now shown
  const indivPay = buildRoleLockdownCopy({
    role: 'student',
    studentFundingCategory: 'INDIVIDUAL_SELF_FUNDED',
    hasPaymentRestriction: true,
    hasNonPaymentRestriction: false,
    lockReasonCode: 'PROGRAMME_RENEWAL_OVERDUE',
  });
  assert.equal(indivPay.headline, 'YOUR LEARNING PORTAL IS CURRENTLY RESTRICTED');
  assert.equal(indivPay.canPay, true);
  assert.equal(indivPay.payNowPath, '/portal/student/payments');

  // 3b. Individual self-funded student — non-payment restriction => NO Pay Now
  const indivAdmin = buildRoleLockdownCopy({
    role: 'student',
    studentFundingCategory: 'INDIVIDUAL_SELF_FUNDED',
    hasPaymentRestriction: false,
    hasNonPaymentRestriction: true,
    isManuallyLocked: true,
    lockReasonCode: 'ACCOUNT_UNDER_REVIEW',
    manualLockReason: 'Your account is under review. Contact Support.',
  });
  assert.equal(indivAdmin.headline, 'YOUR LEARNING PORTAL IS CURRENTLY RESTRICTED');
  assert.equal(indivAdmin.canPay, false);
  assert.equal(indivAdmin.payNowPath, null);

  // 4a. Parent — payment restriction => Pay Now shown
  const parentPay = buildRoleLockdownCopy({
    role: 'parent',
    hasPaymentRestriction: true,
    hasNonPaymentRestriction: false,
    lockReasonCode: 'PARENT_FEE_OVERDUE',
  });
  assert.equal(parentPay.headline, 'YOUR PARENT PORTAL HAS RESTRICTED ACCESS');
  assert.equal(parentPay.canPay, true);
  assert.equal(parentPay.payNowPath, '/portal/parent/payments');
  assert.match(parentPay.message, /child's current programme is overdue/i);

  // 4b. Parent — non-payment manual restriction => NO Pay Now
  const parentAdmin = buildRoleLockdownCopy({
    role: 'parent',
    hasPaymentRestriction: false,
    hasNonPaymentRestriction: true,
    isManuallyLocked: true,
    lockReasonCode: 'SECURITY_REVIEW',
    manualLockReason: 'Security review in progress.',
  });
  assert.equal(parentAdmin.headline, 'YOUR PARENT PORTAL HAS RESTRICTED ACCESS');
  assert.equal(parentAdmin.canPay, false);
  assert.equal(parentAdmin.payNowPath, null);

  // 5. Parent-enrolled student — NEVER sees Pay Now or parental billing figures
  const parentChild = buildRoleLockdownCopy({
    role: 'student',
    studentFundingCategory: 'PARENT_FUNDED',
    hasPaymentRestriction: true,
    hasNonPaymentRestriction: false,
    lockReasonCode: 'PARENT_FEE_OVERDUE',
  });
  assert.equal(parentChild.headline, 'YOUR LEARNING ACCESS IS TEMPORARILY RESTRICTED');
  assert.equal(parentChild.canPay, false);
  assert.equal(parentChild.payNowPath, null);
  assert.match(parentChild.message, /parent or guardian/i);
  assert.doesNotMatch(parentChild.message, /45,000/);
});

test('Multi-restriction independence: paying overdue fee clears ONLY payment lock while manual restriction remains active', () => {
  const now = new Date('2026-11-21T12:00:00.000Z');
  const manualRestriction = {
    restrictionId: 'rst_manual_1',
    targetAccountId: 'sch_09',
    targetAccountType: 'SCHOOL',
    accountName: 'Crestview College',
    schoolId: 'sch_09',
    affectedStudentIds: [],
    affectedProgrammeIds: [],
    restrictionType: 'SECURITY_OR_REVIEW_RESTRICTION',
    reasonCode: 'SECURITY_REVIEW',
    userFacingMessage: 'Account restricted pending security verification.',
    internalAdminNote: 'Private audit note #42',
    restrictedScope: 'INSTITUTION',
    cascadesToLinkedLearners: true,
    appliedByUid: 'admin_1',
    appliedByName: 'Admin One',
    appliedAt: '2026-11-20T09:00:00.000Z',
    effectiveAt: '2026-11-20T09:00:00.000Z',
    expiresAt: null,
    status: 'ACTIVE',
  };

  // Case A: Account is BOTH overdue past 7-day grace AND manually restricted
  const bothActive = evaluateSubscriptionState({
    subscription: {
      id: 'school:sch_09',
      accountType: 'SCHOOL',
      ownerId: 'sch_09',
      ownerName: 'Crestview College',
      billingCycle: 'MONTHLY',
      amount: 180000,
      remainingBalance: 180000,
      nextDueAt: '2026-11-01T00:00:00.000Z', // 20 days overdue
    },
    activeRestrictions: [manualRestriction],
    now,
  });

  assert.equal(bothActive.isLocked, true);
  assert.equal(bothActive.hasPaymentRestriction, true);
  assert.equal(bothActive.hasNonPaymentRestriction, true);
  assert.equal(bothActive.activeRestrictionRecords.length, 2);

  // Case B: Payment is settled (nextDueAt moved forward, balance 0), but manual restriction is STILL active
  const paidButManuallyLocked = evaluateSubscriptionState({
    subscription: {
      id: 'school:sch_09',
      accountType: 'SCHOOL',
      ownerId: 'sch_09',
      ownerName: 'Crestview College',
      billingCycle: 'MONTHLY',
      amount: 180000,
      remainingBalance: 0,
      nextDueAt: '2026-12-21T00:00:00.000Z',
    },
    activeRestrictions: [manualRestriction],
    now,
  });

  assert.equal(paidButManuallyLocked.isLocked, true);
  assert.equal(paidButManuallyLocked.hasPaymentRestriction, false);
  assert.equal(paidButManuallyLocked.hasNonPaymentRestriction, true);
  assert.equal(paidButManuallyLocked.lockReasonCode, 'SECURITY_REVIEW');
  assert.equal(paidButManuallyLocked.activeRestrictionRecords.length, 1);

  // Verify sanitizing the active restrictions for user consumption strips internalAdminNote
  const publicSummaries = paidButManuallyLocked.activeRestrictionRecords.map((r) => sanitizeRestrictionForUser(r));
  assert.equal(JSON.stringify(publicSummaries).includes('Private audit note #42'), false);
});

test('Temporary manual restriction automatically expires and restores access once expiresAt passes', () => {
  const tempRestriction = {
    restrictionId: 'rst_temp_1',
    targetAccountId: 'stu_55',
    targetAccountType: 'INDIVIDUAL_STUDENT',
    accountName: 'Tunde Ade',
    studentId: 'stu_55',
    affectedStudentIds: ['stu_55'],
    affectedProgrammeIds: [],
    restrictionType: 'TEMPORARY_RESTRICTION',
    reasonCode: 'TEMPORARY_ACCESS_RESTRICTION',
    userFacingMessage: 'Short temporary pause during cohort migration.',
    restrictedScope: 'ACCOUNT',
    cascadesToLinkedLearners: false,
    appliedByUid: 'admin_1',
    appliedByName: 'Admin One',
    appliedAt: '2026-11-21T08:00:00.000Z',
    effectiveAt: '2026-11-21T08:00:00.000Z',
    expiresAt: '2026-11-21T14:00:00.000Z',
    status: 'ACTIVE',
  };

  const duringLock = new Date('2026-11-21T12:00:00.000Z');
  const afterExpiry = new Date('2026-11-21T15:00:00.000Z');

  assert.equal(isRestrictionActiveAt(tempRestriction, duringLock), true);
  assert.equal(isRestrictionExpiredAt(tempRestriction, duringLock), false);
  assert.equal(isRestrictionActiveAt(tempRestriction, afterExpiry), false);
  assert.equal(isRestrictionExpiredAt(tempRestriction, afterExpiry), true);

  const sub = {
    id: 'individual_student:stu_55',
    accountType: 'INDIVIDUAL_STUDENT',
    ownerId: 'stu_55',
    ownerName: 'Tunde Ade',
    billingCycle: 'MONTHLY',
    amount: 25000,
    remainingBalance: 0,
    nextDueAt: '2026-12-21T00:00:00.000Z',
  };

  const evalDuring = evaluateSubscriptionState({ subscription: sub, activeRestrictions: [tempRestriction], now: duringLock });
  assert.equal(evalDuring.isLocked, true);

  const evalAfter = evaluateSubscriptionState({ subscription: sub, activeRestrictions: [tempRestriction], now: afterExpiry });
  assert.equal(evalAfter.isLocked, false);
  assert.equal(evalAfter.status, 'ACTIVE');
});

test('Automatic payment lockdown assigns structured account-specific reason codes and deterministic notification IDs', () => {
  assert.equal(getAutomaticPaymentReasonCode('SCHOOL'), 'SCHOOL_SUBSCRIPTION_OVERDUE');
  assert.equal(getAutomaticPaymentReasonCode('PARENT'), 'PARENT_FEE_OVERDUE');
  assert.equal(getAutomaticPaymentReasonCode('PARENT_CHILD'), 'PARENT_FEE_OVERDUE');
  assert.equal(getAutomaticPaymentReasonCode('INDIVIDUAL_STUDENT'), 'PROGRAMME_RENEWAL_OVERDUE');
  assert.equal(getAutomaticPaymentReasonCode('STUDENT_SELF_FUNDED_PROGRAMME'), 'PROGRAMME_RENEWAL_OVERDUE');

  const id1 = buildRestrictionNotificationId('rst_123', 'user_abc');
  const id2 = buildRestrictionNotificationId('rst_123', 'user_abc');
  assert.equal(id1, id2);
  assert.match(id1, /rst_123/);
});

test('Security guardrails: firestore.rules locks down restriction collections; backend never disables Firebase Auth or leaks internalAdminNote', () => {
  const rulesText = fs.readFileSync(path.join(ROOT, 'firestore.rules'), 'utf8');
  for (const col of ['accountRestrictions', 'restrictionAuditLogs', 'restrictionNotificationLogs']) {
    const pattern = new RegExp(`match\\s+/${col}/\\{[^}]+\\}\\s*\\{\\s*allow read:\\s*if isAnyAdmin\\(\\);\\s*allow write:\\s*if false;\\s*\\}`);
    assert.match(rulesText, pattern, `Expected strict admin-read / server-only-write rule for /${col}`);
  }

  const serviceText = fs.readFileSync(path.join(ROOT, 'api/_lib/restriction-service.ts'), 'utf8');
  // Never disables Firebase Auth accounts
  assert.doesNotMatch(serviceText, /disabled:\s*true/);
  assert.doesNotMatch(serviceText, /auth\.updateUser/);

  const billingAdminText = fs.readFileSync(path.join(ROOT, 'netlify/functions/billing-admin.ts'), 'utf8');
  // Bulk lock requires explicit confirmation
  assert.match(billingAdminText, /preview_bulk_lock/);
  assert.match(billingAdminText, /apply_bulk_lock/);
  assert.match(billingAdminText, /confirmed/);
  assert.match(billingAdminText, /lift_restriction/);
});
