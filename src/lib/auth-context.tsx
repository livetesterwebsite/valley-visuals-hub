import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import type { User } from '@supabase/supabase-js';
import { useQueryClient } from '@tanstack/react-query';
import { useNavigate, useRouter } from '@tanstack/react-router';
import { supabase } from '@/integrations/supabase/client';

type AuthContextValue = {
  user: User | null;
  isLoading: boolean;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const router = useRouter();
  const navigate = useNavigate();
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let active = true;
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event !== 'SIGNED_IN' && event !== 'SIGNED_OUT' && event !== 'USER_UPDATED') return;

      setUser(session?.user ?? null);
      if (event === 'SIGNED_OUT') {
        void queryClient.cancelQueries().then(() => queryClient.clear());
      } else {
        void queryClient.invalidateQueries();
      }
      void router.invalidate();
    });

    void supabase.auth.getUser().then(({ data, error }) => {
      if (!active) return;
      setUser(error ? null : data.user);
      setIsLoading(false);
    }).catch(() => {
      if (!active) return;
      setUser(null);
      setIsLoading(false);
    });

    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, [queryClient, router]);

  const signOut = async () => {
    await queryClient.cancelQueries();
    queryClient.clear();
    const { error } = await supabase.auth.signOut();
    if (error) throw error;
    await navigate({ to: '/auth', replace: true });
  };

  return (
    <AuthContext.Provider value={{ user, isLoading, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const value = useContext(AuthContext);
  if (!value) throw new Error('Authentication provider is required');
  return value;
}