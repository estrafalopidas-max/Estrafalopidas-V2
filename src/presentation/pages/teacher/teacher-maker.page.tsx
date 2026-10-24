import React from 'react';
import { Navigate } from 'react-router-dom';

export const TeacherMakerPage: React.FC = () => {
  return <Navigate to="/coordinator/novedades" replace />;
};
