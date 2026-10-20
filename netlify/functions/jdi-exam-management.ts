import type {Handler} from "@netlify/functions";
import {adminAuth,adminDb} from "../../api/_lib/firebase-admin";
import {FieldValue} from "firebase-admin/firestore";
import {createHash,randomBytes} from "node:crypto";
import { normalizeQuestions, schoolSafeQuestion, schoolSafeQuestionResult } from "../../api/_lib/jdi-assessment.js";
const json=(statusCode:number,body:Record<string,unknown>)=>({statusCode,headers:{"Content-Type":"application/json","Cache-Control":"no-store"},body:JSON.stringify(body)});
const norm=(v:unknown)=>String(v||"").trim().toUpperCase();
async function authUser(event:any){const h=event.headers?.authorization||event.headers?.Authorization||"";if(!h.startsWith("Bearer "))throw new Error("AUTH");const d=await adminAuth.verifyIdToken(h.slice(7));const s=await adminDb.collection("users").doc(d.uid).get();if(!s.exists)throw new Error("PROFILE");const u=s.data()||{};if(["DISABLED","SUSPENDED","BANNED"].includes(norm(u.status||u.accountStatus)))throw new Error("INACTIVE");return {uid:d.uid,role:norm(u.role),user:u};}
const admins=["SUPER_ADMIN","SUPERADMIN","ADMIN"];
const tutors=["TUTOR","STAFF","INSTRUCTOR"];
const statusTransitions:Record<string,string[]>={draft:["draft","scheduled","active","archived"],scheduled:["scheduled","active","completed","archived"],active:["active","completed","archived"],completed:["completed","archived"],archived:["archived"]};
async function canSchool(c:any,schoolId:string){
 if(admins.includes(c.role))return true;
 // School administrators may view reports for their own school, but do not manage exams.
 if(["SCHOOL","SCHOOL_ADMIN"].includes(c.role))return String(c.user.schoolId||c.user.school_id||c.uid)===schoolId;
 if(tutors.includes(c.role)){
  const profileSchoolIds=[c.user.schoolId,c.user.school_id,...(Array.isArray(c.user.schoolIds)?c.user.schoolIds:[]),...(Array.isArray(c.user.assignedSchoolIds)?c.user.assignedSchoolIds:[])].filter(Boolean).map(String);
  if(profileSchoolIds.includes(schoolId))return true;
  const s=await adminDb.collection("staffSchoolAccess").doc(c.uid).get();
  const d=s.data()||{};
  const accessSchoolIds=[d.schoolId,...(Array.isArray(d.schoolIds)?d.schoolIds:[]),...(Array.isArray(d.assignedSchoolIds)?d.assignedSchoolIds:[])].filter(Boolean).map(String);
  return accessSchoolIds.includes(schoolId);
 }
 return false;
}
async function canManageExam(c:any,exam:any){
 // Do not reuse the reporting permission for writes: only tutors/staff and Super Admins may mutate exams.
 if(!admins.includes(c.role)&&!tutors.includes(c.role))return false;
 const schoolId=String(exam.schoolId||"");
 if(schoolId)return canSchool(c,schoolId);
 if(exam.audienceType==="individual")return admins.includes(c.role)||(tutors.includes(c.role)&&String(exam.createdBy||"")===c.uid);
 return false;
}
async function notify(uids:string[],payload:any,dedupeKey?:string){const recipients=[...new Set(uids.map(uid=>String(uid||"")).filter(Boolean))];if(dedupeKey){for(let offset=0;offset<recipients.length;offset+=50){await Promise.all(recipients.slice(offset,offset+50).map(async uid=>{const id=createHash("sha256").update(dedupeKey+":"+uid).digest("hex");const notificationRef=adminDb.collection("jdiNotifications").doc(id);await adminDb.runTransaction(async tx=>{const existing=await tx.get(notificationRef);if(existing.exists)return;tx.create(notificationRef,{...payload,recipientUid:uid,isRead:false,createdAt:FieldValue.serverTimestamp()});});}));}return;}for(let offset=0;offset<recipients.length;offset+=400){const batch=adminDb.batch();for(const uid of recipients.slice(offset,offset+400)){const ref=adminDb.collection("jdiNotifications").doc();batch.set(ref,{...payload,recipientUid:uid,isRead:false,createdAt:FieldValue.serverTimestamp()});}await batch.commit();}}
export const handler:Handler=async event=>{try{const c=await authUser(event);const method=event.httpMethod||"GET";const body=JSON.parse(event.body||"{}");const path=String(event.path||"");const action=String(body.action||"");
 if(method==="GET"){
 const examId=String(event.queryStringParameters?.examId||"");
 const schoolId=String(event.queryStringParameters?.schoolId||c.user.schoolId||"");
 let examDocs:any[]=[];
 const examDocMap=new Map<string,any>();
 if(schoolId){
  if(!(await canSchool(c,schoolId)))return json(403,{error:"Not authorised for this school."});
  const snap=await adminDb.collection("jdiExams").where("schoolId","==",schoolId).limit(100).get();snap.docs.forEach((d:any)=>examDocMap.set(d.id,d));
 }
 if(admins.includes(c.role)){
  const snap=await adminDb.collection("jdiExams").where("audienceType","==","individual").limit(100).get();snap.docs.forEach((d:any)=>examDocMap.set(d.id,d));
 }else if(tutors.includes(c.role)){
  const snap=await adminDb.collection("jdiExams").where("createdBy","==",c.uid).limit(100).get();snap.docs.filter((d:any)=>d.data().audienceType==="individual").forEach((d:any)=>examDocMap.set(d.id,d));
 }else if(!schoolId)return json(403,{error:"Not authorised to view examination history."});
 examDocs=Array.from(examDocMap.values());
 if(examId)examDocs=examDocs.filter(d=>d.id===examId);
 const examMap:Record<string,any>={};for(const d of examDocs)examMap[d.id]=d.data();
 let attemptDocs:any[]=[];
 const attemptMap=new Map<string,any>();
 if(schoolId){const attempts=await adminDb.collection("jdiExamAttempts").where("schoolId","==",schoolId).limit(500).get();attempts.docs.forEach((d:any)=>attemptMap.set(d.id,d));}
 const individualExamDocs=examDocs.filter((d:any)=>d.data().audienceType==="individual");
 const attemptResults=await Promise.all(individualExamDocs.map((d:any)=>adminDb.collection("jdiExamAttempts").where("examId","==",d.id).limit(500).get()));
 attemptResults.forEach(s=>s.docs.forEach((d:any)=>attemptMap.set(d.id,d)));attemptDocs=Array.from(attemptMap.values());
 const studentMap:Record<string,any>={};
 if(schoolId){
  const students=await adminDb.collection("students").where("schoolId","==",schoolId).limit(500).get();
  for(const d of students.docs){const s=d.data();studentMap[d.id]={name:String(s.fullName||s.name||[s.firstName,s.lastName].filter(Boolean).join(" ")||"Student"),className:String(s.className||s.classLevel||s.classId||"")};}
 }
 const studentIds=new Set<string>();for(const e of Object.values(examMap) as any[])for(const id of Array.isArray(e.studentIds)?e.studentIds:[])studentIds.add(String(id));
 for(const studentId of studentIds){if(studentMap[studentId])continue;let snap=await adminDb.collection("individualStudents").doc(studentId).get();if(!snap.exists)snap=await adminDb.collection("students").doc(studentId).get();if(snap.exists){const s=snap.data()||{};studentMap[studentId]={name:String(s.fullName||s.name||[s.firstName,s.lastName].filter(Boolean).join(" ")||"Student"),className:String(s.className||s.classLevel||s.classId||"")};}}
 const rows=attemptDocs.filter(d=>!examId||d.data().examId===examId).map(d=>{const a=d.data();const student=studentMap[String(a.studentId)]||{};const e=examMap[String(a.examId)]||{};const schoolCanViewFinal=["SCHOOL","SCHOOL_ADMIN"].includes(c.role)&&((a.status==="graded")||((a.status==="submitted"||a.status==="expired")&&a.autoGraded===true));const row:any={id:d.id,examId:a.examId,studentId:a.studentId,studentName:student.name||"Student",className:student.className||"",status:a.status,score:(a.releasedAt||tutors.includes(c.role)||admins.includes(c.role)||schoolCanViewFinal)?a.score:undefined,maxScore:(Array.isArray(e.questions)?e.questions:[]).reduce((sum:number,q:any)=>sum+Math.max(0,Number(q.points)||0),0),submittedAt:a.submittedAt?.toDate?a.submittedAt.toDate().toISOString():null,deadlineAt:a.deadlineAt||null,releasedAt:a.releasedAt?.toDate?a.releasedAt.toDate().toISOString():null,autoGraded:a.autoGraded};if(tutors.includes(c.role)||admins.includes(c.role)){row.feedback=String(a.feedback||"");row.answers=a.answers||{};row.questionResults=Array.isArray(a.questionResults)?a.questionResults:[];row.manualMarks=Array.isArray(a.manualMarks)?a.manualMarks:[];row.questions=Array.isArray(e.questions)?e.questions.map((q:any)=>({id:q.id,prompt:q.prompt,points:q.points,type:q.type,options:Array.isArray(q.options)?q.options:[],correctOptionIds:Array.isArray(q.correctOptionIds)?q.correctOptionIds:[],acceptedAnswers:Array.isArray(q.acceptedAnswers)?q.acceptedAnswers:[],explanation:q.explanation||""})):[];}else if(a.releasedAt||schoolCanViewFinal){row.feedback=a.releasedAt?String(a.feedback||""):"";row.questionResults=Array.isArray(a.questionResults)?a.questionResults.map(schoolSafeQuestionResult):[];row.questions=Array.isArray(e.questions)?e.questions.map(schoolSafeQuestion):[];}return row;});
 let auditEvents:any[]=[];if(examId){const events=await adminDb.collection("jdiExams").doc(examId).collection("events").orderBy("createdAt","desc").limit(100).get().catch(()=>null);auditEvents=(events?.docs||[]).map(d=>{const e=d.data();const base:any={id:d.id,type:e.type,createdAt:e.createdAt?.toDate?e.createdAt.toDate().toISOString():String(e.createdAt||""),actorUid:e.actorUid||""};if(tutors.includes(c.role)||admins.includes(c.role))return {...e,...base};return {...base,...(e.reason?{reason:e.reason}:{}),...(e.regradedAttemptCount!==undefined?{regradedAttemptCount:e.regradedAttemptCount}:{})};}).filter(e=>tutors.includes(c.role)||admins.includes(c.role)||e.type==="result_released"||e.type==="answer_key_corrected");}
 return json(200,{exams:examDocs.map(d=>{const e=d.data();const item:any={id:d.id,title:e.title,subject:e.subject,status:e.status,durationMinutes:e.durationMinutes,classIds:e.classIds,audienceType:e.audienceType||"school",studentIds:e.studentIds||[],createdAt:e.createdAt,availableFrom:e.availableFrom,availableUntil:e.availableUntil};if(tutors.includes(c.role)||admins.includes(c.role))item.questions=Array.isArray(e.questions)?e.questions.map((q:any)=>({id:q.id,prompt:q.prompt,points:q.points,type:q.type,options:Array.isArray(q.options)?q.options:[],correctOptionIds:Array.isArray(q.correctOptionIds)?q.correctOptionIds:[],acceptedAnswers:Array.isArray(q.acceptedAnswers)?q.acceptedAnswers:[]})):[];return {id:d.id,...item};}),attempts:rows,auditEvents});
 }
 if(method==="POST"){
 const examId=String(body.examId||"");const ref=adminDb.collection("jdiExams").doc(examId);const snap=await ref.get();if(!snap.exists)return json(404,{error:"Examination not found."});const exam=snap.data()||{};if(!(await canManageExam(c,exam)))return json(403,{error:"Not authorised to manage this examination."});
 if(action==="update"){
  if(!tutors.includes(c.role)&&!admins.includes(c.role))return json(403,{error:"Only authorised tutors and Super Admins can edit examinations."});
  const updates=body.updates;if(!updates||typeof updates!=="object"||Array.isArray(updates))return json(400,{error:"Provide valid examination settings."});
  const protectedFields=["durationMinutes","gradingMode","classIds","availableFrom","availableUntil","questions","maxAttempts","shuffleQuestions","shuffleOptions","passcode"];
  const changesProtectedFields=protectedFields.some(key=>updates[key]!==undefined);
  if(exam.status!=="draft"&&changesProtectedFields)return json(409,{error:"Published or scheduled examination settings are locked. Duplicate the examination into a new draft version to change timing, questions, answer keys, class assignments, passcode, or grading settings."});if(updates.status!==undefined&&!((statusTransitions[String(exam.status||"draft")]||[]).includes(String(updates.status))))return json(409,{error:"This examination status transition is not allowed. Published exams cannot be returned to draft; duplicate them to create a new version."});
  const attemptsStarted=await adminDb.collection("jdiExamAttempts").where("examId","==",examId).limit(1).get();
  if(!attemptsStarted.empty&&changesProtectedFields)return json(409,{error:"Examination settings are locked after a student attempt starts. Create a new exam version to change them."});
  const patch:any={updatedAt:FieldValue.serverTimestamp(),updatedBy:c.uid};
  if(updates.title!==undefined){const value=String(updates.title).trim();if(!value||value.length>200)return json(400,{error:"Title must be 1–200 characters."});patch.title=value;}
  if(updates.subject!==undefined){const value=String(updates.subject).trim();if(!value||value.length>120)return json(400,{error:"Subject must be 1–120 characters."});patch.subject=value;}
  if(updates.instructions!==undefined)patch.instructions=String(updates.instructions).slice(0,5000);
  if(updates.seriesName!==undefined)patch.seriesName=String(updates.seriesName).trim().slice(0,160);
  if(updates.courseName!==undefined)patch.courseName=String(updates.courseName).trim().slice(0,160);
  if(updates.learningVideoUrl!==undefined){const value=String(updates.learningVideoUrl||"").trim();if(value){try{const url=new URL(value);if(!["http:","https:"].includes(url.protocol))throw new Error("URL");}catch{return json(400,{error:"Learning video URL must be a valid http or https link."});}}patch.learningVideoUrl=value||null;}
  if(updates.durationMinutes!==undefined){const value=Number(updates.durationMinutes);if(!Number.isInteger(value)||value<1||value>300)return json(400,{error:"Duration must be a whole number from 1 to 300 minutes."});patch.durationMinutes=value;}
  if(updates.maxAttempts!==undefined){const value=Number(updates.maxAttempts);if(!Number.isInteger(value)||value<1||value>10)return json(400,{error:"Maximum attempts must be an integer from 1 to 10."});patch.maxAttempts=value;}
  if(updates.shuffleQuestions!==undefined){if(typeof updates.shuffleQuestions!=="boolean")return json(400,{error:"Invalid question randomisation setting."});patch.shuffleQuestions=updates.shuffleQuestions;}
  if(updates.shuffleOptions!==undefined){if(typeof updates.shuffleOptions!=="boolean")return json(400,{error:"Invalid option randomisation setting."});patch.shuffleOptions=updates.shuffleOptions;}
  if(updates.gradingMode!==undefined){if(!["automatic","manual"].includes(String(updates.gradingMode)))return json(400,{error:"Invalid grading mode."});patch.gradingMode=String(updates.gradingMode);}
  if(updates.status!==undefined){if(!["draft","scheduled","active","completed","archived"].includes(String(updates.status)))return json(400,{error:"Invalid examination status."});patch.status=String(updates.status);}
  if(updates.classIds!==undefined){if(!Array.isArray(updates.classIds)||updates.classIds.length>100)return json(400,{error:"Invalid class assignment."});patch.classIds=updates.classIds.map(String);}
  const nextAvailableFrom=updates.availableFrom!==undefined?(updates.availableFrom?String(updates.availableFrom):null):(exam.availableFrom||null);const nextAvailableUntil=updates.availableUntil!==undefined?(updates.availableUntil?String(updates.availableUntil):null):(exam.availableUntil||null);const fromTime=nextAvailableFrom?Date.parse(nextAvailableFrom):null;const untilTime=nextAvailableUntil?Date.parse(nextAvailableUntil):null;if((fromTime!==null&&!Number.isFinite(fromTime))||(untilTime!==null&&!Number.isFinite(untilTime))||(fromTime!==null&&untilTime!==null&&untilTime<=fromTime))return json(400,{error:"The examination closing time must be after its opening time, and both dates must be valid."});if(String(patch.status??exam.status??"draft")==="scheduled"&&!nextAvailableFrom)return json(400,{error:"Scheduled examinations need an opening date and time."});if(updates.availableFrom!==undefined)patch.availableFrom=nextAvailableFrom;if(updates.availableUntil!==undefined)patch.availableUntil=nextAvailableUntil;
  if(updates.passcode!==undefined){const code=String(updates.passcode).trim();if(code.length<6||code.length>128)return json(400,{error:"Passcode must be 6–128 characters."});const salt=randomBytes(16).toString("hex");patch.passcodeSalt=salt;patch.passcodeHash=createHash("sha256").update(salt+":"+code).digest("hex");}
  if(updates.questions!==undefined){if(!Array.isArray(updates.questions)||!updates.questions.length||updates.questions.length>200)return json(400,{error:"Provide 1–200 questions."});const mode=String(updates.gradingMode||exam.gradingMode||"automatic");const ids=new Set<string>();const allowedTypes=["single_choice","multiple_choice","true_false","short_answer","essay"];const invalid=updates.questions.some((q:any,index:number)=>{if(!q||typeof q!=="object"||!String(q.prompt||"").trim()||String(q.prompt).length>5000||!allowedTypes.includes(String(q.type||"single_choice"))||!Number.isFinite(Number(q.points??1))||Number(q.points??1)<0||Number(q.points??1)>1000)return true;const id=String(q.id||"q"+(index+1));if(ids.has(id))return true;ids.add(id);if(["single_choice","multiple_choice","true_false"].includes(String(q.type||"single_choice"))){const options=Array.isArray(q.options)?q.options:[];const optionIds=options.map((o:any,i:number)=>String(o?.id||i));if(options.length<2||options.length>10||new Set(optionIds).size!==optionIds.length||options.some((o:any)=>!String(o?.text||"").trim()))return true;const correct=Array.isArray(q.correctOptionIds)?[...new Set(q.correctOptionIds.map(String))]:[];if(mode!=="manual"&&(!correct.length||correct.some((optionId:string)=>!optionIds.includes(optionId))||(["single_choice","true_false"].includes(String(q.type||"single_choice"))&&correct.length!==1)))return true;}return false;});if(invalid)return json(400,{error:"Each question needs a unique ID, valid text and marks; objective questions need 2–10 unique options and valid correct answers for automatic marking."});patch.questions=updates.questions.map((q:any,index:number)=>({id:String(q.id||"q"+(index+1)),type:String(q.type||"single_choice"),prompt:String(q.prompt||"").trim().slice(0,5000),options:Array.isArray(q.options)?q.options.slice(0,10).map((o:any,j:number)=>({id:String(o.id||j),text:String(o.text||"").trim().slice(0,1000)})):[],correctOptionIds:Array.isArray(q.correctOptionIds)?[...new Set(q.correctOptionIds.map(String))]:[],acceptedAnswers:Array.isArray(q.acceptedAnswers)?q.acceptedAnswers.map(String).map((v:string)=>v.trim().slice(0,500)).filter(Boolean).slice(0,20):[],points:Math.max(0,Math.min(1000,Number(q.points??1))),required:q.required!==false}));}
  await ref.update(patch);return json(200,{ok:true,examId,updatedFields:Object.keys(patch).filter(k=>!["updatedAt","updatedBy"].includes(k))});
 }
 if(action==="correctAnswerKey"){
  if(!tutors.includes(c.role)&&!admins.includes(c.role))return json(403,{error:"Only authorised tutors and Super Admins can correct an answer key."});
  const questionId=String(body.questionId||"").trim();const reason=String(body.reason||"").trim();
  if(!questionId||reason.length<5||reason.length>1000)return json(400,{error:"Select a question and provide a correction reason (5–1000 characters)."});
  const questions=Array.isArray(exam.questions)?exam.questions.map((q:any)=>({...q})):[];const index=questions.findIndex((q:any)=>String(q.id)===questionId);
  if(index<0)return json(404,{error:"Question not found."});
  const q=questions[index];const oldKey={correctOptionIds:Array.isArray(q.correctOptionIds)?q.correctOptionIds:[],acceptedAnswers:Array.isArray(q.acceptedAnswers)?q.acceptedAnswers:[]};
  if(["single_choice","multiple_choice","true_false"].includes(String(q.type))){
    if(!Array.isArray(body.correctOptionIds)||!body.correctOptionIds.length)return json(400,{error:"Provide at least one correct option ID."});
    const ids=[...new Set(body.correctOptionIds.map(String))];const valid=new Set((Array.isArray(q.options)?q.options:[]).map((o:any)=>String(o.id)));
    if(ids.some((id:string)=>!valid.has(id))||(q.type==="single_choice"&&ids.length!==1))return json(400,{error:"Correct option IDs must match this question's options."});
    q.correctOptionIds=ids;
  }else if(q.type==="short_answer"){
    if(!Array.isArray(body.acceptedAnswers)||!body.acceptedAnswers.some((v:any)=>String(v).trim()))return json(400,{error:"Provide at least one accepted short answer."});
    q.acceptedAnswers=body.acceptedAnswers.map((v:any)=>String(v).trim().slice(0,500)).filter(Boolean).slice(0,20);
  }else return json(409,{error:"Essay questions require manual grading; an answer-key correction cannot regrade them automatically."});
  questions[index]=q;
  await ref.update({questions,updatedAt:FieldValue.serverTimestamp(),updatedBy:c.uid});
  const attemptSnap=await adminDb.collection("jdiExamAttempts").where("examId","==",examId).get();
  const changed:Array<{id:string;studentUid:string;oldScore:number;newScore:number;released:boolean}>=[];
  const batchWrites:any[]=[];
  for(const attemptDoc of attemptSnap.docs){
    const a=attemptDoc.data();
    if(!["submitted","expired","graded"].includes(String(a.status))||a.autoGraded!==true||Array.isArray(a.manualMarks)&&a.manualMarks.length)continue;
    const answers=a.answers||{};let score=0;const results:any[]=[];
    for(const question of questions){
      const answer=answers[question.id];let correct=false;let points=0;
      if(["single_choice","multiple_choice","true_false"].includes(String(question.type))){
        const expected=(Array.isArray(question.correctOptionIds)?question.correctOptionIds:[]).map(String).sort();
        const actual=(Array.isArray(answer)?answer:[String(answer||"")]).map(String).sort();
        correct=expected.length>0&&expected.length===actual.length&&expected.every((v:string,i:number)=>v===actual[i]);
      }else if(question.type==="short_answer"){
        const normAnswer=(value:any)=>String(value||"").trim().toLowerCase();
        correct=Array.isArray(question.acceptedAnswers)&&question.acceptedAnswers.some((v:string)=>normAnswer(v)===normAnswer(answer));
      }
      if(correct) {points=Math.max(0,Number(question.points)||0);score+=points;}
      results.push({questionId:question.id,...(answer===undefined?{}:{answer}),correct,pointsAwarded:points,maxPoints:Math.max(0,Number(question.points)||0)});
    }
    changed.push({id:attemptDoc.id,studentUid:String(a.studentUid||""),oldScore:Number(a.score||0),newScore:score,released:Boolean(a.releasedAt)});
    batchWrites.push({ref:attemptDoc.ref,data:{score,questionResults:results,regradedAt:FieldValue.serverTimestamp(),regradedBy:c.uid,updatedAt:FieldValue.serverTimestamp()}});
  }
  for(let i=0;i<batchWrites.length;i+=400){const batch=adminDb.batch();batchWrites.slice(i,i+400).forEach(w=>batch.update(w.ref,w.data));await batch.commit();}
  const auditRef=ref.collection("events").doc();
  await auditRef.set({type:"answer_key_corrected",questionId,reason,actorUid:c.uid,oldAnswerKey:oldKey,newAnswerKey:{correctOptionIds:q.correctOptionIds||[],acceptedAnswers:q.acceptedAnswers||[]},regradedAttemptCount:changed.length,attempts:changed.map(a=>({attemptId:a.id,studentUid:a.studentUid,oldScore:a.oldScore,newScore:a.newScore,released:a.released})),createdAt:FieldValue.serverTimestamp()});
  const affectedReleased=changed.filter(a=>a.released);
  const schoolRecipients=new Set<string>();
  if(exam.createdBy)schoolRecipients.add(String(exam.createdBy));
  if(String(exam.schoolId||"")){
    const schoolUsers=await adminDb.collection("users").where("schoolId","==",String(exam.schoolId)).limit(100).get().catch(()=>null);
    schoolUsers?.docs.forEach(d=>{if(["SCHOOL","SCHOOL_ADMIN"].includes(String(d.data().role||"").toUpperCase()))schoolRecipients.add(d.id);});
  }
  for(const a of affectedReleased){
    const recipients=[a.studentUid,...schoolRecipients].filter(Boolean);
    const attemptData=attemptSnap.docs.find(d=>d.id===a.id)?.data()||{};
    let studentRecord=await adminDb.collection("individualStudents").doc(String(attemptData.studentId||"")).get();
    if(!studentRecord.exists)studentRecord=await adminDb.collection("students").doc(String(attemptData.studentId||"")).get();
    const parentId=String(studentRecord.data()?.parentId||studentRecord.data()?.guardianId||"");if(parentId)recipients.push(parentId);
    await notify(recipients,{type:"exam_result_corrected",title:"Examination result corrected",message:"A correction was made to the answer key for "+String(exam.title||"an examination")+". The affected result has been recalculated.",examId,attemptId:a.id});
  }
  return json(200,{ok:true,questionId,regradedAttempts:changed.length,releasedResultsUpdated:affectedReleased.length,auditId:auditRef.id});
 }
 if(action==="grade"){if(!tutors.includes(c.role)&&!admins.includes(c.role))return json(403,{error:"Only authorised tutors and Super Admins can grade."});const attemptId=String(body.attemptId||"");const aRef=adminDb.collection("jdiExamAttempts").doc(attemptId);const aSnap=await aRef.get();if(!aSnap.exists||aSnap.data()?.examId!==examId)return json(404,{error:"Attempt not found."});if(!["submitted","expired","graded"].includes(String(aSnap.data()?.status)))return json(409,{error:"The student must submit or time out before grading."});const reason=String(body.reason||"").trim();const feedback=String(body.feedback||"").trim().slice(0,4000);if(reason.length<5||reason.length>1000)return json(400,{error:"Provide a grading reason (5–1000 characters)."});const marks=body.marks;if(!marks||typeof marks!=="object"||Array.isArray(marks))return json(400,{error:"Provide marks by question ID."});if(Object.values(marks).some((value:any)=>!Number.isFinite(Number(value))||Number(value)<0))return json(400,{error:"Marks must be finite non-negative numbers."});const validIds=new Set((Array.isArray(exam.questions)?exam.questions:[]).map((q:any)=>String(q.id)));if(Object.keys(marks).some(key=>!validIds.has(key)))return json(400,{error:"Marks contain an unknown question ID."});const gradingQuestions=Array.isArray(exam.questions)?exam.questions:[];const missingMarks=gradingQuestions.filter((q:any)=>!Object.prototype.hasOwnProperty.call(marks,String(q.id)));if(missingMarks.length)return json(409,{error:"Grade every question before finalizing this result. Missing marks for question(s): "+missingMarks.map((q:any)=>String(q.id)).join(", ")});for(const q of gradingQuestions){const mark=Number(marks[q.id]);const max=Math.max(0,Number(q.points)||0);if(!Number.isFinite(mark)||mark<0||mark>max)return json(400,{error:"Each mark must be finite and between 0 and the question maximum."});}let score=0;const result:any[]=[];for(const q of gradingQuestions){const max=Math.max(0,Number(q.points)||0);const mark=Number(marks[q.id]);score+=mark;result.push({questionId:q.id,pointsAwarded:mark,maxPoints:max});}const priorScore=Number(aSnap.data()?.score||0);const auditRef=ref.collection("events").doc();const gradingBatch=adminDb.batch();gradingBatch.set(auditRef,{type:"attempt_manually_graded",attemptId,actorUid:c.uid,reason,feedback,previousScore:priorScore,newScore:score,manualMarks:result,createdAt:FieldValue.serverTimestamp()});gradingBatch.update(aRef,{manualMarks:result,questionResults:result,score,gradingReason:reason,feedback,gradingAuditId:auditRef.id,gradedBy:c.uid,gradedAt:FieldValue.serverTimestamp(),releasedAt:FieldValue.delete(),releasedBy:FieldValue.delete(),status:"graded",updatedAt:FieldValue.serverTimestamp()});await gradingBatch.commit();return json(200,{ok:true,score,auditId:auditRef.id});}
 if(action==="release"){
  if(!admins.includes(c.role)&&!tutors.includes(c.role))return json(403,{error:"Only authorised tutors and Super Admins can release results."});
  const attemptId=String(body.attemptId||"");
  const aRef=adminDb.collection("jdiExamAttempts").doc(attemptId);
  const aSnap=await aRef.get();
  if(!aSnap.exists||aSnap.data()?.examId!==examId)return json(404,{error:"Attempt not found."});
  const a=aSnap.data()||{};
  if(!["submitted","expired","graded"].includes(String(a.status)))return json(409,{error:"Attempt must be submitted before releasing results."});
  if(a.autoGraded===false&&a.status!=="graded")return json(409,{error:"Manually graded questions must be marked before releasing this result."});
  const resultRecipients=[String(a.studentUid||"")];
  if(exam.createdBy)resultRecipients.push(String(exam.createdBy));
  let studentRecord=await adminDb.collection("individualStudents").doc(String(a.studentId||"")).get();
  if(!studentRecord.exists)studentRecord=await adminDb.collection("students").doc(String(a.studentId||"")).get();
  const parentId=String(studentRecord.data()?.parentId||studentRecord.data()?.guardianId||"");
  if(parentId)resultRecipients.push(parentId);
  if(String(exam.schoolId||"")){
    const schoolUsers=await adminDb.collection("users").where("schoolId","==",String(exam.schoolId)).limit(50).get().catch(()=>null);
    schoolUsers?.docs.forEach(d=>{const role=String(d.data().role||"").toUpperCase();if(["SCHOOL","SCHOOL_ADMIN"].includes(role))resultRecipients.push(d.id);});
  }
  const notificationPayload={type:"exam_result_released",title:"Examination result released",message:"The result for "+String(exam.title||"an examination")+" has been released.",examId,attemptId};
  const releaseAudit=ref.collection("events").doc();
  const releaseResult=await adminDb.runTransaction(async tx=>{
    const currentSnap=await tx.get(aRef);
    if(!currentSnap.exists||currentSnap.data()?.examId!==examId)return {kind:"missing" as const};
    const current=currentSnap.data()||{};
    if(current.releasedAt)return {kind:"unchanged" as const,auditId:String(current.releaseAuditId||"")};
    if(!["submitted","expired","graded"].includes(String(current.status))||(current.autoGraded===false&&current.status!=="graded"))return {kind:"not-ready" as const};
    tx.set(releaseAudit,{type:"result_released",attemptId,actorUid:c.uid,score:current.score??null,createdAt:FieldValue.serverTimestamp()});
    tx.update(aRef,{releasedAt:FieldValue.serverTimestamp(),releasedBy:c.uid,releaseAuditId:releaseAudit.id,updatedAt:FieldValue.serverTimestamp()});
    return {kind:"released" as const,auditId:releaseAudit.id};
  });
  if(releaseResult.kind==="missing")return json(404,{error:"Attempt not found."});
  if(releaseResult.kind==="not-ready")return json(409,{error:"Manually graded questions must be marked before releasing this result."});
  await notify(resultRecipients,notificationPayload,"result-release:"+examId+":"+attemptId);
  return json(200,{ok:true,unchanged:releaseResult.kind==="unchanged",auditId:releaseResult.auditId||undefined});
}
 if(action==="activate"){if(!admins.includes(c.role)&&!tutors.includes(c.role))return json(403,{error:"Only authorised tutors and Super Admins can change examination status."});const status=String(body.status||"active");if(!["active","scheduled","completed","archived","draft"].includes(status))return json(400,{error:"Invalid status."});if(["active","scheduled"].includes(status)){const checked=normalizeQuestions(Array.isArray(exam.questions)?exam.questions:[],exam.gradingMode==="manual"?"manual":"automatic");if(checked.error)return json(400,{error:"This examination cannot be published yet: "+checked.error});}const currentStatus=String(exam.status||"draft");if(!(statusTransitions[currentStatus]||[]).includes(status))return json(409,{error:"This examination status transition is not allowed. Published exams cannot be returned to draft or reopened after completion; duplicate them to create a new version."});const unchanged=currentStatus===status;if(!unchanged){const statusEvent=ref.collection("events").doc();const statusBatch=adminDb.batch();statusBatch.update(ref,{status,updatedAt:FieldValue.serverTimestamp(),updatedBy:c.uid});statusBatch.set(statusEvent,{type:"exam_status_changed",status,actorUid:c.uid,previousStatus:currentStatus,createdAt:FieldValue.serverTimestamp()});await statusBatch.commit();}const recipients:string[]=[];if(exam.audienceType==="individual"){recipients.push(...(Array.isArray(exam.studentUids)?exam.studentUids.map(String):[]));}else{const students=await adminDb.collection("students").where("schoolId","==",String(exam.schoolId)).limit(500).get();recipients.push(...students.docs.filter(d=>!Array.isArray(exam.classIds)||!exam.classIds.length||exam.classIds.includes(String(d.data().classId||d.data().class_id||d.data().classLevel||d.data().className||d.data().class||""))).map(d=>String(d.data().firebaseUid||d.data().userId||"")));const schoolUsers=await adminDb.collection("users").where("schoolId","==",String(exam.schoolId)).limit(50).get().catch(()=>null);schoolUsers?.docs.forEach(d=>{const role=String(d.data().role||"").toUpperCase();if(["SCHOOL","SCHOOL_ADMIN"].includes(role))recipients.push(d.id)});}if(exam.createdBy)recipients.push(String(exam.createdBy));await notify(recipients,{type:"exam_status_changed",title:"Examination updated",message:String(exam.title||"An examination")+" is now "+status+".",examId},`exam-status:${examId}:${status}`);return json(200,{ok:true,status,unchanged});}
 return json(404,{error:"Unknown examination management action."});
 }
 return json(405,{error:"Method not allowed."});
}catch(e){const m=e instanceof Error?e.message:"";if(m==="AUTH")return json(401,{error:"Authentication required."});if(m==="PROFILE")return json(403,{error:"Portal profile not found."});if(m==="INACTIVE")return json(403,{error:"Account is inactive."});console.error("JDI exam management error",e);return json(500,{error:"Unable to complete examination management request."});}};
