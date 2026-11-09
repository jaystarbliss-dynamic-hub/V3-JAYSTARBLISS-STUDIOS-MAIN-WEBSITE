import React from 'react';
import { Navigate } from 'react-router-dom';

export default function TutorSubjects() {
  return <Navigate to="/portal/staff/settings#subjects-i-teach" replace />;
}

