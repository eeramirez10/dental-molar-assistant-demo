import DashboardClient from '@/app/dashboard-client';
import { getDashboardData } from '@/lib/dashboard-data';

export const dynamic = 'force-dynamic';

export default async function BookingPage() {
  const data = await getDashboardData();

  return (
    <DashboardClient
      initialAppointments={data.appointments}
      services={data.services}
      initialAvailabilityByService={data.availabilityByService}
      page="booking"
    />
  );
}
