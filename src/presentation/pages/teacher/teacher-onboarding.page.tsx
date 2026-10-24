import React from 'react';
import { Navigate } from 'react-router-dom';

export const TeacherOnboardingPage: React.FC = () => {
  return <Navigate to="/coordinator/matrix" replace />;
};
