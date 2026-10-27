import { lazy, Suspense } from 'react';
import { createBrowserRouter } from 'react-router';
import { GuestOnly, RequireAdmin, RequireAuth } from './auth/guards';
import { FullPageLoader } from './components/FullPageLoader';
import { AppLayout } from './layouts/AppLayout';
import { ChatPage } from './pages/ChatPage';
import { ErrorPage } from './pages/ErrorPage';
import { ForgotPasswordPage, ResetPasswordPage } from './pages/PasswordResetPages';
import { LoginPage } from './pages/LoginPage';
import { RegisterPage } from './pages/RegisterPage';

// The admin dashboard is code-split: regular users never download it.
const AdminPage = lazy(() => import('./pages/AdminPage'));

export const router = createBrowserRouter([
  {
    errorElement: <ErrorPage />,
    children: [
      {
        path: '/login',
        element: (
          <GuestOnly>
            <LoginPage />
          </GuestOnly>
        ),
      },
      {
        path: '/register',
        element: (
          <GuestOnly>
            <RegisterPage />
          </GuestOnly>
        ),
      },
      {
        path: '/forgot-password',
        element: (
          <GuestOnly>
            <ForgotPasswordPage />
          </GuestOnly>
        ),
      },
      // Not guest-only: the emailed link must work even in a browser that is signed in.
      { path: '/reset-password', element: <ResetPasswordPage /> },
      {
        element: (
          <RequireAuth>
            <AppLayout />
          </RequireAuth>
        ),
        children: [
          { index: true, element: <ChatPage /> },
          { path: 'c/:conversationId', element: <ChatPage /> },
          {
            path: 'admin',
            element: (
              <RequireAdmin>
                <Suspense fallback={<FullPageLoader />}>
                  <AdminPage />
                </Suspense>
              </RequireAdmin>
            ),
          },
        ],
      },
      { path: '*', element: <ErrorPage notFound /> },
    ],
  },
]);
