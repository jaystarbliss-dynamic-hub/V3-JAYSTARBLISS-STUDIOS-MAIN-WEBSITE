import { adminDb } from "./firebase-admin";

export type BillingRole = "student" | "parent" | "school" | "tutor" | "staff" | "admin" | "superadmin";
export interface FeePolicy { percentage:number; flat:number; cap:number; waiveFlatBelow:number; enabled:boolean; }
export interface WithdrawalFeePolicy { percentage:number; flat:number; cap:number; enabled:boolean; }
export interface PaymentPlan { id:string; name:string; role:"student"|"school"; baseAmount:number; durationWeeks:number; teachingModes:string[]; description:string; active:boolean; }
export interface PaymentConfig { version:number; parentFeePolicy:FeePolicy; schoolFeePolicy:FeePolicy; withdrawalFeePolicy:WithdrawalFeePolicy; minimumWithdrawalAmount:number; plans:Record<string,PaymentPlan>; }
const defaultFeePolicy:FeePolicy={percentage:1.5,flat:100,cap:2000,waiveFlatBelow:2500,enabled:true};
const defaultWithdrawalFeePolicy:WithdrawalFeePolicy={percentage:0,flat:0,cap:0,enabled:false};
export const DEFAULT_PAYMENT_CONFIG:PaymentConfig={version:3,parentFeePolicy:{...defaultFeePolicy},schoolFeePolicy:{...defaultFeePolicy},withdrawalFeePolicy:{...defaultWithdrawalFeePolicy},minimumWithdrawalAmount:10000,plans:{
plan_weekend:{id:"plan_weekend",name:"Weekend Coding Track",role:"student",baseAmount:45000,durationWeeks:4,teachingModes:["Weekend group class","Hybrid support"],description:"Structured weekend coding and project-based learning.",active:true},
plan_mentorship:{id:"plan_mentorship",name:"1-on-1 Intensive Mentorship",role:"student",baseAmount:120000,durationWeeks:4,teachingModes:["1-on-1 intensive","Private scheduled sessions"],description:"Dedicated mentor support with a personalised 4-week learning cycle.",active:true},
plan_robotics:{id:"plan_robotics",name:"Digital & Technical Skills Track",role:"student",baseAmount:85000,durationWeeks:4,teachingModes:["Hands-on sessions","Hybrid support"],description:"Practical digital and technical skills learning.",active:true},
school_standard:{id:"school_standard",name:"School Learning Partnership",role:"school",baseAmount:350000,durationWeeks:12,teachingModes:["On-site school delivery","Hybrid school delivery"],description:"School learning programmes and tutor support for partner schools.",active:true},
school_cbt:{id:"school_cbt",name:"Assessment Portal & School Suite",role:"school",baseAmount:600000,durationWeeks:52,teachingModes:["School delivery","Hybrid assessment programme"],description:"School-wide assessments and teacher enablement suite.",active:true}}};
const mergeConfig=(raw:Record<string,any>|undefined):PaymentConfig=>{const value=raw||{};const plans={...DEFAULT_PAYMENT_CONFIG.plans};Object.entries(value.plans||{}).forEach(([id,plan])=>{if(plan&&typeof plan==="object")plans[id]={...plans[id],...plan,id,teachingModes:Array.isArray(plan.teachingModes)?plan.teachingModes.filter((item:unknown):item is string=>typeof item==="string"):(plans[id]?.teachingModes||[])} as PaymentPlan});return {...DEFAULT_PAYMENT_CONFIG,...value,parentFeePolicy:{...DEFAULT_PAYMENT_CONFIG.parentFeePolicy,...(value.parentFeePolicy||{})},schoolFeePolicy:{...DEFAULT_PAYMENT_CONFIG.schoolFeePolicy,...(value.schoolFeePolicy||{})},withdrawalFeePolicy:{...DEFAULT_PAYMENT_CONFIG.withdrawalFeePolicy,...(value.withdrawalFeePolicy||{})},minimumWithdrawalAmount:Number(value.minimumWithdrawalAmount||DEFAULT_PAYMENT_CONFIG.minimumWithdrawalAmount),plans};};
export async function getPaymentConfig(){const snap=await adminDb.collection("payment_config").doc("settings").get();return mergeConfig(snap.exists?snap.data():undefined);}
export function calculateCustomerCharge(baseAmount:number,policy:FeePolicy){const base=Math.max(0,Number(baseAmount)||0);if(!policy.enabled||base<=0)return{baseAmount:base,transactionFee:0,totalAmount:base};const percentage=Math.max(0,Number(policy.percentage)||0)/100;const flat=base<Number(policy.waiveFlatBelow||0)?0:Math.max(0,Number(policy.flat)||0);const cap=Number(policy.cap)>0?Number(policy.cap):Number.POSITIVE_INFINITY;const rawFeeOnBase=base*percentage+flat;let total:number;if(rawFeeOnBase>cap)total=base+cap;else total=(base+flat)/Math.max(.000001,1-percentage)+.01;total=Math.ceil(total*100)/100;return{baseAmount:base,transactionFee:Math.max(0,Number((total-base).toFixed(2))),totalAmount:total};}
export function calculateWithdrawalFee(amount:number,policy:WithdrawalFeePolicy){const gross=Math.max(0,Number(amount)||0);if(!policy.enabled||gross<=0)return{grossAmount:gross,serviceFee:0,netAmount:gross};const pct=gross*(Math.max(0,Number(policy.percentage)||0)/100);const flat=Math.max(0,Number(policy.flat)||0);const uncapped=pct+flat;const cap=Number(policy.cap)>0?Number(policy.cap):Number.POSITIVE_INFINITY;const serviceFee=Math.min(uncapped,cap);return{grossAmount:gross,serviceFee:Number(serviceFee.toFixed(2)),netAmount:Number(Math.max(0,gross-serviceFee).toFixed(2))};}
export function getFeePolicy(config:PaymentConfig,role:"parent"|"school"){return role==="school"?config.schoolFeePolicy:config.parentFeePolicy;}
export function normaliseRole(value:unknown):BillingRole{const role=String(value||"").toLowerCase();if(role==="super_admin"||role==="superadmin"||role==="owner")return"superadmin";if(role==="school"||role==="school_admin"||role==="schooladmin"||role==="partner_school"||role==="institution")return"school";if(role==="administrator"||role==="admin"||role.includes("admin"))return"admin";if(role==="tutor"||role==="instructor")return"tutor";if(role==="staff")return"staff";if(role==="parent")return"parent";return"student";}
export async function getUserRecord(uid:string,email?:string){const snap=await adminDb.collection("users").doc(uid).get();if(snap.exists){const data=snap.data()||{};if(email&&!data.email)data.email=email;if(String(data.email||email||"").toLowerCase()==="johnrufai242@gmail.com"){return{uid,email:data.email||email,role:"SUPER_ADMIN",accountStatus:"ACTIVE",...data};}return{uid,...data};}const superAdminEmails=["johnrufai242@gmail.com"];if(email&&superAdminEmails.includes(email.toLowerCase())){return{uid,email,role:"SUPER_ADMIN",accountStatus:"ACTIVE"};}return{uid,role:"",accountStatus:"DISABLED"};}
export function isPrivilegedRole(role:BillingRole){return["admin","superadmin"].includes(role);}
export function isStaffRole(role:BillingRole){return["tutor","staff"].includes(role);}
export function isActiveRecord(data:Record<string,any>){return!["SUSPENDED","BANNED","DISABLED","INACTIVE"].includes(String(data.accountStatus||data.status||"ACTIVE").toUpperCase());}
export async function resolveTutorFromStudent(studentId:string){for(const collectionName of["individualStudents","students"]){const ref=adminDb.collection(collectionName).doc(studentId);const snap=await ref.get();if(!snap.exists)continue;const data=snap.data()||{};const tutorId=String(data.tutorId||data.staffId||data.assignedTutorId||data.assignedStaffId||data.instructorId||"").trim();if(!tutorId)return{studentRef:ref,student:data,tutorId:""};return{studentRef:ref,student:data,tutorId};}return null;}
export function addWeeks(date:Date,weeks:number){const next=new Date(date.getTime());next.setDate(next.getDate()+Number(weeks)*7);return next;}

const SUCCESSFUL_PAYMENT_STATUSES = new Set([
  "SUCCESS",
  "SUCCESSFUL",
  "PAID",
  "COMPLETED",
  "APPROVED",
  "CONFIRMED",
  "VERIFIED"
]);

const PARTIAL_PAYMENT_STATUSES = new Set([
  "PARTIALLY_PAID",
  "PARTIAL"
]);

export function isSuccessfulPaymentStatus(status: unknown): boolean {
  const normalized = String(status ?? "").trim().toUpperCase();
  if (!normalized) return false;
  return SUCCESSFUL_PAYMENT_STATUSES.has(normalized);
}

export function isPartiallyPaidStatus(status: unknown): boolean {
  const normalized = String(status ?? "").trim().toUpperCase();
  if (!normalized) return false;
  return PARTIAL_PAYMENT_STATUSES.has(normalized);
}

export function isSuccessfulPaymentRecord(payment: Record<string, any> | null | undefined): boolean {
  if (!payment || typeof payment !== "object") return false;
  return isSuccessfulPaymentStatus(payment.status ?? payment.paymentStatus);
}

export function extractPaymentAmountNaira(payment: Record<string, any> | null | undefined): number {
  if (!payment || typeof payment !== "object") return 0;
  for (const key of ["customerTotal", "totalAmount", "amountPaid", "grossAmount"]) {
    const val = Number(payment[key]);
    if (Number.isFinite(val) && val > 0) return Number(val.toFixed(2));
  }
  const base = Number(payment.baseAmount);
  const fee = Number(payment.transactionFee || 0);
  if (Number.isFinite(base) && base > 0) {
    return Number((base + (Number.isFinite(fee) && fee > 0 ? fee : 0)).toFixed(2));
  }
  const rawAmount = Number(payment.amount);
  if (!Number.isFinite(rawAmount) || rawAmount <= 0) return 0;
  const providerMinor = Number(payment.providerAmount || payment.amountMinor || 0);
  const looksLikeLegacyKobo =
    (providerMinor > 0 && rawAmount === providerMinor && !payment.amountInNaira) ||
    (Boolean(payment.gatewayFeeVerified || payment.verifiedBy) && !payment.amountInNaira && rawAmount >= 100000 && rawAmount % 100 === 0);
  const naira = looksLikeLegacyKobo ? rawAmount / 100 : rawAmount;
  return Number(naira.toFixed(2));
}

export function extractPaymentBaseAmountNaira(payment: Record<string, any> | null | undefined): number {
  if (!payment || typeof payment !== "object") return 0;
  const base = Number(payment.baseAmount);
  if (Number.isFinite(base) && base > 0) return Number(base.toFixed(2));
  const total = extractPaymentAmountNaira(payment);
  const fee = Number(payment.transactionFee || 0);
  if (total > 0 && Number.isFinite(fee) && fee > 0 && total > fee) {
    return Number((total - fee).toFixed(2));
  }
  return total;
}

export async function resolveTrustedStudentFeeAndTutor(params: {
  student: Record<string, any>;
  programId?: string;
  programName?: string;
  config: PaymentConfig;
  parentBilling?: Record<string, any> | null;
}): Promise<{
  amount: number;
  tutorId: string;
  tutorName: string;
  programId: string;
  programName: string;
}> {
  const { student, programId, programName, config, parentBilling } = params;
  const studentTutorId = String(
    student.tutorId ||
    student.staffId ||
    student.assignedTutorId ||
    student.assignedStaffId ||
    student.instructorId ||
    ""
  ).trim();
  const studentTutorName = String(
    student.tutorName ||
    student.assignedTutorName ||
    student.instructorName ||
    ""
  ).trim();

  const enrolledList = Array.isArray(student.enrolledPrograms)
    ? student.enrolledPrograms
    : Array.isArray(student.programs)
      ? student.programs
      : [];

  const targetPid = String(programId || "").trim();
  const targetPName = String(programName || "").trim().toLowerCase();

  let matchedProg: Record<string, any> | null = null;
  if (enrolledList.length > 0) {
    for (const rawProg of enrolledList) {
      if (rawProg && typeof rawProg === "object") {
        const pId = String(rawProg.id || rawProg.programId || "").trim();
        const pTitle = String(rawProg.title || rawProg.name || rawProg.programName || "").trim().toLowerCase();
        if ((targetPid && pId === targetPid) || (targetPName && pTitle === targetPName)) {
          matchedProg = rawProg;
          break;
        }
      }
    }
    if (!matchedProg && enrolledList.length === 1 && typeof enrolledList[0] === "object") {
      matchedProg = enrolledList[0];
    }
  }

  let resolvedAmount = 0;
  let resolvedTutorId = studentTutorId;
  let resolvedTutorName = studentTutorName;
  let resolvedProgramId = targetPid || String(student.programId || student.planId || "assigned_student_plan").trim();
  let resolvedProgramName =
    String(programName || student.programName || student.programTitle || student.course || student.track || student.plan || "Assigned Tuition Plan").trim();

  if (matchedProg) {
    const progFee = Number(matchedProg.remainingBalance ?? matchedProg.tuitionFee ?? matchedProg.price ?? matchedProg.fee ?? matchedProg.amount ?? 0);
    if (Number.isFinite(progFee) && progFee > 0) resolvedAmount = progFee;
    if (matchedProg.tutorId || matchedProg.assignedTutorId) {
      resolvedTutorId = String(matchedProg.tutorId || matchedProg.assignedTutorId).trim();
    }
    if (matchedProg.tutorName || matchedProg.assignedTutorName) {
      resolvedTutorName = String(matchedProg.tutorName || matchedProg.assignedTutorName).trim();
    }
    if (matchedProg.id || matchedProg.programId) {
      resolvedProgramId = String(matchedProg.id || matchedProg.programId).trim();
    }
    if (matchedProg.title || matchedProg.name || matchedProg.programName) {
      resolvedProgramName = String(matchedProg.title || matchedProg.name || matchedProg.programName).trim();
    }
  }

  // Check Firestore programs collection if amount is still 0 and we have a program ID
  if (resolvedAmount <= 0 && resolvedProgramId && !resolvedProgramId.startsWith("prog_") && resolvedProgramId !== "assigned_student_plan") {
    const progSnap = await adminDb.collection("programs").doc(resolvedProgramId).get().catch(() => null);
    if (progSnap && progSnap.exists) {
      const pData = progSnap.data() || {};
      const dbProgFee = Number(pData.tuitionFee ?? pData.price ?? pData.fee ?? pData.amount ?? 0);
      if (Number.isFinite(dbProgFee) && dbProgFee > 0) resolvedAmount = dbProgFee;
      if (!resolvedTutorId && (pData.tutorId || pData.leadTutorId)) {
        resolvedTutorId = String(pData.tutorId || pData.leadTutorId).trim();
      }
      if (pData.title || pData.name) {
        resolvedProgramName = String(pData.title || pData.name).trim();
      }
    }
  }

  // Check student's own configured fee or remaining balance (if partially paid)
  if (resolvedAmount <= 0) {
    const isPartial = isPartiallyPaidStatus(student.paymentStatus ?? student.status);
    const remaining = Number(student.remainingBalance ?? 0);
    const studentFee = isPartial && remaining > 0
      ? remaining
      : Number(student.tuitionFee ?? student.fee ?? student.amount ?? student.price ?? 0);
    if (Number.isFinite(studentFee) && studentFee > 0) {
      resolvedAmount = studentFee;
    }
  }

  // Check static/configured payment plan on student or requested programId
  if (resolvedAmount <= 0) {
    const candidatePlanId = String(student.planId || resolvedProgramId || "").trim();
    const planFromConfig = config.plans[candidatePlanId];
    if (planFromConfig && Number(planFromConfig.baseAmount) > 0) {
      resolvedAmount = Number(planFromConfig.baseAmount);
      resolvedProgramId = planFromConfig.id;
      resolvedProgramName = planFromConfig.name;
    }
  }

  // Fallback to parent's admin-assigned billing record if present
  if (resolvedAmount <= 0 && parentBilling && Number(parentBilling.baseAmount) > 0 && String(parentBilling.status || "ACTIVE").toUpperCase() !== "DISABLED") {
    const isPartial = isPartiallyPaidStatus(parentBilling.status);
    const remaining = Number(parentBilling.remainingBalance ?? 0);
    resolvedAmount = isPartial && remaining > 0 ? remaining : Number(parentBilling.baseAmount);
  }

  return {
    amount: Math.max(0, Number(resolvedAmount.toFixed(2))),
    tutorId: resolvedTutorId,
    tutorName: resolvedTutorName,
    programId: resolvedProgramId,
    programName: resolvedProgramName
  };
}

