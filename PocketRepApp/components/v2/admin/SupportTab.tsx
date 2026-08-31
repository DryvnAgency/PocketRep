// Owner Control Center — Support tab
// Wraps the existing AdminSupportDashboard component.

import AdminSupportDashboard from '../AdminSupportDashboard';

export default function SupportTab({ onSignOut }: { onSignOut: () => void }) {
  return (
    <AdminSupportDashboard open onClose={() => {}} embedded onSignOut={onSignOut} />
  );
}
