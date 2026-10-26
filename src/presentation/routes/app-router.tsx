import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { MainLayout } from '../layouts/main-layout';
import { CoordinatorDesktopMatrixPage } from '../pages/coordinator/coordinator-desktop-matrix.page';
import { CoordinatorAssignmentsPage } from '../pages/coordinator/coordinator-assignments.page';
import { TeacherOnboardingPage } from '../pages/teacher/teacher-onboarding.page';
import { TeacherLockedPage } from '../pages/teacher/teacher-locked.page';
import { CoordinatorIncidencesPage } from '../pages/coordinator/coordinator-incidences.page';
import { PublicScheduleViewerPage } from '../pages/public/public-schedule-viewer.page';

import { CoordinatorMatrixProvider } from '../context/CoordinatorMatrixContext';
import { AuthProvider } from '../context/AuthContext';
import { CoordinatorAuthGuard } from '../components/auth/CoordinatorAuthGuard';

const RootEntryGuard: React.FC = () => {
  const isPublicMaskedSession =
    typeof window !== 'undefined' &&
    (sessionStorage.getItem('ievf_public_view_active') === '1' ||
      new URLSearchParams(window.location.search).has('h'));

  if (isPublicMaskedSession) {
    return <PublicScheduleViewerPage />;
  }

  return <Navigate to="/coordinator/matrix" replace />;
};

export const AppRouter: React.FC = () => {
  return (
    <BrowserRouter>
      <AuthProvider>
        <CoordinatorMatrixProvider>
          <Routes>
            <Route path="public/schedule" element={<PublicScheduleViewerPage />} />
            <Route path="h" element={<PublicScheduleViewerPage />} />
            <Route path="h/:code" element={<PublicScheduleViewerPage />} />
            <Route path="v/:code" element={<PublicScheduleViewerPage />} />
            <Route path="s/:code" element={<PublicScheduleViewerPage />} />
            <Route index element={<RootEntryGuard />} />
            <Route
              path="/"
              element={
                <CoordinatorAuthGuard>
                  <MainLayout />
                </CoordinatorAuthGuard>
              }
            >
              <Route path="coordinator/matrix" element={<CoordinatorDesktopMatrixPage />} />
              <Route path="coordinator/assignments" element={<CoordinatorAssignmentsPage />} />
              <Route path="coordinator/novedades" element={<CoordinatorIncidencesPage />} />
              <Route path="register/teacher" element={<TeacherOnboardingPage />} />
              <Route path="teacher/locked" element={<TeacherLockedPage />} />
              <Route path="teacher/absences" element={<CoordinatorIncidencesPage />} />
              <Route path="*" element={<Navigate to="/coordinator/matrix" replace />} />
            </Route>
          </Routes>
        </CoordinatorMatrixProvider>
      </AuthProvider>
    </BrowserRouter>
  );
};
