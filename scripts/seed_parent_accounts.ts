import { initializeApp, getApps } from "firebase/app";
import { initializeFirestore, doc, setDoc, getDoc, getDocs, collection, query, where, serverTimestamp } from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyD_lq2Z4qBrZZkzYmEMPPMtCKQmfSx2rkY",
  authDomain: "jaystarbliss-studios.firebaseapp.com",
  projectId: "jaystarbliss-studios",
  storageBucket: "jaystarbliss-studios.firebasestorage.app",
  messagingSenderId: "885364100276",
  appId: "1:885364100276:web:1159c4cbd9159aaa0e1be1",
  firestoreDatabaseId: "(default)"
};

const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApps()[0];
const db = initializeFirestore(app, {});

async function main() {
  console.log("Seeding parent accounts and students...");

  // 1. Parent: GIFT TORRU (gifttorru@gmail.com)
  const parent1Email = "gifttorru@gmail.com".toLowerCase();
  const parent1Name = "GIFT TORRU";
  const parent1Uid = `parent_gift_torru`;

  // Create user record in `users`
  await setDoc(doc(db, "users", parent1Email), {
    uid: parent1Uid,
    email: parent1Email,
    displayName: parent1Name,
    fullName: parent1Name,
    role: "parent",
    roles: ["parent"],
    isParent: true,
    status: "ACTIVE",
    accountStatus: "ACTIVE",
    childrenCount: 3,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp()
  }, { merge: true });

  await setDoc(doc(db, "users", parent1Uid), {
    uid: parent1Uid,
    email: parent1Email,
    displayName: parent1Name,
    fullName: parent1Name,
    role: "parent",
    roles: ["parent"],
    isParent: true,
    status: "ACTIVE",
    accountStatus: "ACTIVE",
    childrenCount: 3,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp()
  }, { merge: true });

  // Children for GIFT TORRU: SHAWN TORRU, JAYDEN TORRU, EMANUELLA TORRU
  const childrenGift = [
    {
      id: "shawn_torru",
      fullName: "SHAWN TORRU",
      studentName: "SHAWN TORRU",
      username: "shawntorru",
      accessCode: "TORRU-SHAWN-01",
      parentName: parent1Name,
      parentEmail: parent1Email,
      parentId: parent1Uid,
      role: "student",
      studentType: "parent",
      status: "APPROVED",
      accountStatus: "ACTIVE",
      plan: "Robotics, IoT & Electronics",
      track: "Robotics, IoT & Electronics",
      teachingMode: "Online 1-on-1",
      cycle: "monthly",
      amount: 45000,
      tuitionFee: 45000,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    },
    {
      id: "jayden_torru",
      fullName: "JAYDEN TORRU",
      studentName: "JAYDEN TORRU",
      username: "jaydentorru",
      accessCode: "TORRU-JAYDEN-02",
      parentName: parent1Name,
      parentEmail: parent1Email,
      parentId: parent1Uid,
      role: "student",
      studentType: "parent",
      status: "APPROVED",
      accountStatus: "ACTIVE",
      plan: "Python AI & Machine Learning",
      track: "Python AI & Machine Learning",
      teachingMode: "Online 1-on-1",
      cycle: "monthly",
      amount: 45000,
      tuitionFee: 45000,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    },
    {
      id: "emanuella_torru",
      fullName: "EMANUELLA TORRU",
      studentName: "EMANUELLA TORRU",
      username: "emanuellatorru",
      accessCode: "TORRU-EMANUELLA-03",
      parentName: parent1Name,
      parentEmail: parent1Email,
      parentId: parent1Uid,
      role: "student",
      studentType: "parent",
      status: "APPROVED",
      accountStatus: "ACTIVE",
      plan: "Full-Stack Web Engineering",
      track: "Full-Stack Web Engineering",
      teachingMode: "Online 1-on-1",
      cycle: "monthly",
      amount: 45000,
      tuitionFee: 45000,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    }
  ];

  for (const child of childrenGift) {
    await setDoc(doc(db, "individualStudents", child.id), child, { merge: true });
    await setDoc(doc(db, "students", child.id), child, { merge: true });
    await setDoc(doc(db, "enrollment_requests", child.id), {
      ...child,
      source: "parent_registration",
      submittedAt: new Date().toISOString()
    }, { merge: true });
  }

  // 2. Parent: ANIE UDOFIA (anie.udofia31@gmail.com)
  const parent2Email = "anie.udofia31@gmail.com".toLowerCase();
  const parent2Name = "ANIE UDOFIA";
  const parent2Uid = `parent_anie_udofia`;

  // Create user record in `users`
  await setDoc(doc(db, "users", parent2Email), {
    uid: parent2Uid,
    email: parent2Email,
    displayName: parent2Name,
    fullName: parent2Name,
    role: "parent",
    roles: ["parent"],
    isParent: true,
    status: "ACTIVE",
    accountStatus: "ACTIVE",
    childrenCount: 2,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp()
  }, { merge: true });

  await setDoc(doc(db, "users", parent2Uid), {
    uid: parent2Uid,
    email: parent2Email,
    displayName: parent2Name,
    fullName: parent2Name,
    role: "parent",
    roles: ["parent"],
    isParent: true,
    status: "ACTIVE",
    accountStatus: "ACTIVE",
    childrenCount: 2,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp()
  }, { merge: true });

  // Children for ANIE UDOFIA: ANIEBIET ZOE (zoeudofiazu), ANIEBIET JOANNA
  const childrenUdofia = [
    {
      id: "zoeudofiazu",
      fullName: "ANIEBIET ZOE",
      studentName: "ANIEBIET ZOE",
      username: "zoeudofiazu",
      accessCode: "UDOFIA-ZOE-01",
      parentName: parent2Name,
      parentEmail: parent2Email,
      parentId: parent2Uid,
      role: "student",
      studentType: "parent",
      status: "APPROVED",
      accountStatus: "ACTIVE",
      plan: "Scratch Creative Coding & Animation",
      track: "Scratch Creative Coding & Animation",
      teachingMode: "Online 1-on-1",
      cycle: "monthly",
      amount: 35000,
      tuitionFee: 35000,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    },
    {
      id: "aniebiet_joanna",
      fullName: "ANIEBIET JOANNA",
      studentName: "ANIEBIET JOANNA",
      username: "aniebietjoanna",
      accessCode: "UDOFIA-JOANNA-02",
      parentName: parent2Name,
      parentEmail: parent2Email,
      parentId: parent2Uid,
      role: "student",
      studentType: "parent",
      status: "APPROVED",
      accountStatus: "ACTIVE",
      plan: "Game Development (Roblox & Unity)",
      track: "Game Development (Roblox & Unity)",
      teachingMode: "Online 1-on-1",
      cycle: "monthly",
      amount: 35000,
      tuitionFee: 35000,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    }
  ];

  for (const child of childrenUdofia) {
    await setDoc(doc(db, "individualStudents", child.id), child, { merge: true });
    await setDoc(doc(db, "students", child.id), child, { merge: true });
    await setDoc(doc(db, "enrollment_requests", child.id), {
      ...child,
      source: "parent_registration",
      submittedAt: new Date().toISOString()
    }, { merge: true });
  }

  console.log("Successfully seeded parent accounts and assigned students!");
}

main().catch(err => {
  console.error("Seeding error:", err);
  process.exit(1);
});
