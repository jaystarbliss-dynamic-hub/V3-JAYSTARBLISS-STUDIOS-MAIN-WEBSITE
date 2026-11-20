import type { Handler } from '@netlify/functions';
import { adminAuth, adminDb } from '../../api/_lib/firebase-admin';
import { enforceEntitlementOrLock } from '../../api/_lib/subscription-service';

const json=(statusCode:number,body:Record<string,unknown>)=>({statusCode,headers:{'Content-Type':'application/json','Cache-Control':'no-store'},body:JSON.stringify(body)});
const blocked=(v:unknown)=>['DISABLED','SUSPENDED','BANNED'].includes(String(v||'ACTIVE').toUpperCase());

export const handler: Handler=async event=>{
 if(event.httpMethod!=='POST') return json(405,{error:'Method Not Allowed'});
 try{
  const raw=event.headers?.authorization||event.headers?.Authorization||'';
  if(!raw.startsWith('Bearer ')) return json(401,{error:'Authentication required.'});
  const entitlementGuard=await enforceEntitlementOrLock(event);
  if(!entitlementGuard.ok) return entitlementGuard.response;
  const decoded=entitlementGuard.decoded;
  const callerSnap=await adminDb.collection('users').doc(decoded.uid).get();
  const caller=callerSnap.data()||{};
  if(String(caller.role||'').toUpperCase()!=='SCHOOL'||blocked(caller)) return json(403,{error:'Only active school administrators can manage their roster.'});
  const schoolId=String(caller.schoolId||'').trim();
  if(!schoolId) return json(403,{error:'School account is not linked to a school.'});
  const body=JSON.parse(event.body||'{}');
  const studentId=String(body.studentId||'').trim();
  const action=String(body.action||'disable').toLowerCase();
  if(!studentId||!['disable','enable'].includes(action)) return json(400,{error:'Invalid roster action.'});

  let ref=adminDb.collection('individualStudents').doc(studentId);
  let snap=await ref.get();
  if(!snap.exists){ref=adminDb.collection('students').doc(studentId);snap=await ref.get();}
  if(!snap.exists) return json(404,{error:'Student record not found.'});
  const student=snap.data()||{};
  if(String(student.schoolId||'')!==schoolId) return json(403,{error:'This student does not belong to your school.'});

  const active=action==='enable';
  const now=new Date();
  await ref.set({portalAccessEnabled:active,accountStatus:active?'ACTIVE':'DISABLED',updatedAt:now}, {merge:true});
  const uid=String(student.firebaseUid||student.userId||'');
  if(uid){
    await adminDb.collection('users').doc(uid).set({portalAccessEnabled:active,accountStatus:active?'ACTIVE':'DISABLED',updatedAt:now},{merge:true});
    try{await adminAuth.updateUser(uid,{disabled:!active});}catch(error){console.warn('Could not sync Firebase Auth status:',error);}
  }
  await adminDb.collection('activityLogs').add({actorId:decoded.uid,action:active?'SCHOOL_STUDENT_REACTIVATED':'SCHOOL_STUDENT_REMOVED_FROM_PORTAL',targetId:studentId,targetType:'student',schoolId,timestamp:now,metadata:{portalAccessEnabled:active}});
  return json(200,{success:true,studentId,portalAccessEnabled:active,accountStatus:active?'ACTIVE':'DISABLED'});
 }catch(error){console.error('School student status error:',error);return json(500,{error:'Unable to update the student portal access.'});}
};
