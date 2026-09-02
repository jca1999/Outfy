import { useEffect, useState, type ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AuthProvider, useAuth } from '@/auth/auth-context';
import { ErrorBoundary } from '@/components/error-boundary';
import { CreatePlanDialog } from '@/components/create-plan-dialog';
import { OutfyShell } from '@/components/outfy-shell';
import { activities as initialActivities } from '@/mock-data';
import { Explore } from '@/pages/explore';
import { Home } from '@/pages/home';
import { Matches } from '@/pages/matches';
import { Chats } from '@/pages/chats';
import { Profile } from '@/pages/profile';
import { SignIn } from '@/pages/auth/sign-in';
import { SignUp } from '@/pages/auth/sign-up';
import { VerifyEmail } from '@/pages/auth/verify-email';
import { Toaster } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';
import NotFound from '@/pages/not-found';
import { ForgotPassword } from '@/pages/auth/forgot-password';
import { ResetPassword } from '@/pages/auth/reset-password';
import {
  Route,
  Switch,
  useLocation,
  Router as WouterRouter,
} from 'wouter';

const queryClient = new QueryClient();

function Router() {
  const { user, loading } = useAuth();
  const [location, navigate] = useLocation();
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

  const guestAuthRoute =
    location === '/sign-in' ||
    location === '/sign-up' ||
    location === '/verify-email' ||
    location === '/forgot-password';

  const resetPasswordRoute = location === '/reset-password';

  const authRoute = guestAuthRoute || resetPasswordRoute;

  useEffect(() => {
    if (loading) return;
    if (!user && !authRoute) {
      navigate('/sign-in');
    } else if (user && guestAuthRoute) {
      navigate('/');
    }
  }, [authRoute, loading, navigate, user]);

  if (loading) {
    return (
      <div className="auth-loading-screen">
        <span className="auth-loading-mark">
          <span>o</span>
        </span>
        <p className="font-mono-ui text-[10px] uppercase tracking-[.18em] text-muted-foreground">
          preparando tu espacio
        </p>
      </div>
    );
  }

  if (resetPasswordRoute) {
    return (
      <RoutedErrorBoundary>
        <ResetPassword />
      </RoutedErrorBoundary>
    );
  }
  
  if (!user) {
    return (
      <RoutedErrorBoundary>
        <Switch>
          <Route path="/sign-in" component={SignIn} />
          <Route path="/sign-up" component={SignUp} />
          <Route path="/verify-email" component={VerifyEmail} />
          <Route path="/forgot-password" component={ForgotPassword} />
          <Route component={SignIn} />
        </Switch>
      </RoutedErrorBoundary>
    );
  }

  if (authRoute) return null;

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
          <AuthProvider>
            <Router />
          </AuthProvider>
        </WouterRouter>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
