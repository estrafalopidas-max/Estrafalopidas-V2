import React from 'react';
import { Navigate } from 'react-router-dom';

export const TeacherLockedPage: React.FC = () => {
  return <Navigate to="/coordinator/matrix" replace />;
};
