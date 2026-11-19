import { Navigate, Route, Routes } from 'react-router-dom'
import { ForgotPasswordPage, LoginPage, RegisterPage, VerifyEmailPage } from '../../features/auth/AuthPages'
import { OverviewPage } from '../../features/overview/OverviewPage'
import {
  SecretCreatePage,
  SecretDetailPage,
  SecretEditPage,
  SecretsEmptyDetail,
  SecretsWorkspace,
} from '../../features/secrets/SecretPages'
import { TagsPage } from '../../features/tags/TagsPage'
import { AppLayout, OpenAuthLayout, PublicLayout } from '../layouts/AppLayout'

export function AppRoutes() {
  return (
    <Routes>
      <Route element={<PublicLayout />}>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/register" element={<RegisterPage />} />
        <Route path="/forgot-password" element={<ForgotPasswordPage />} />
      </Route>
      {/* Reachable signed in or out: the link arrives by email and may be opened in an active session. */}
      <Route element={<OpenAuthLayout />}>
        <Route path="/verify-email" element={<VerifyEmailPage />} />
      </Route>
      <Route element={<AppLayout />}>
        <Route path="/dashboard" element={<OverviewPage />} />
        <Route path="/secrets" element={<SecretsWorkspace />}>
          <Route index element={<SecretsEmptyDetail />} />
          <Route path="create" element={<SecretCreatePage />} />
          <Route path=":id" element={<SecretDetailPage />} />
          <Route path=":id/edit" element={<SecretEditPage />} />
        </Route>
        <Route path="/tags" element={<TagsPage />} />
      </Route>
      <Route path="*" element={<Navigate to="/secrets" replace />} />
    </Routes>
  )
}
