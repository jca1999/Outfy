import { useState, type ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ErrorBoundary } from '@/components/error-boundary';
import { CreatePlanDialog } from '@/components/create-plan-dialog';
import { OutfyShell } from '@/components/outfy-shell';
import { activities as initialActivities } from '@/mock-data';
import { Explore } from '@/pages/explore';
import { Home } from '@/pages/home';
import { Matches } from '@/pages/matches';
import { Chats } from '@/pages/chats';
import { Profile } from '@/pages/profile';
import { Toaster } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';
import NotFound from '@/pages/not-found';
import {
  Route,
  Switch,
  useLocation,
  Router as WouterRouter,
} from 'wouter';

const queryClient = new QueryClient();

function Router() {
  const [activities, setActivities] = useState(initialActivities);
  const [saved, setSaved] = useState<Set<string>>(new Set(['cine-verdi']));
  const [interested, setInterested] = useState<Set<string>>(new Set(['futbol-parque']));
  const [dialogOpen, setDialogOpen] = useState(false);
  const toggleSet = (setter: React.Dispatch<React.SetStateAction<Set<string>>>, id: string) => {
    setter((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };
  const createActivity = (title: string) => {
    setActivities((current) => [...current, {
      id: `custom-${Date.now()}`,
      title,
      category: 'Creativo',
      day: 'Próximamente',
      date: 'Fecha por decidir',
      time: 'Hora por decidir',
      location: 'Zaragoza',
      neighborhood: 'Por decidir',
      participants: 1,
      capacity: 8,
      host: 'Laura C.',
      hostInitials: 'LC',
      description: 'Un plan propuesto por la comunidad.',
      tone: 'coral',
    }]);
    setDialogOpen(false);
  };
  const shared = {
    activities,
    saved,
    interested,
    onSave: (id: string) => toggleSet(setSaved, id),
    onInterest: (id: string) => toggleSet(setInterested, id),
  };
  return (
    <RoutedErrorBoundary>
      <OutfyShell onCreateActivity={() => setDialogOpen(true)}>
        <Switch>
          <Route path="/" component={() => <Home {...shared} onCreate={() => setDialogOpen(true)} />} />
          <Route path="/explore" component={() => <Explore {...shared} />} />
          <Route path="/matches" component={Matches} />
          <Route path="/chats" component={Chats} />
          <Route path="/profile" component={Profile} />
          <Route component={NotFound} />
        </Switch>
      </OutfyShell>
      <CreatePlanDialog open={dialogOpen} onClose={() => setDialogOpen(false)} onCreate={createActivity} />
    </RoutedErrorBoundary>
  );
}

function RoutedErrorBoundary({ children }: { children: ReactNode }) {
  const [location] = useLocation();
  return <ErrorBoundary resetKey={location}>{children}</ErrorBoundary>;
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, '')}>
          <Router />
        </WouterRouter>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
