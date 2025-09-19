import React, { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Navigation } from '@/components/Navigation';
import { Footer } from '@/components/Footer';
import { AuthTabs } from '@/components/AuthPages';
import { useAuth } from '@/contexts/AuthContext';

const Auth = () => {
  const { user } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (user) {
      navigate('/');
    }
  }, [user, navigate]);

  return (
    <div className="min-h-screen bg-gradient-to-b from-background to-earth-light/20">
      <Navigation />

      <section className="py-20 px-4">
        <div className="max-w-4xl mx-auto">
          <div className="text-center mb-12">
            <h1 className="text-4xl lg:text-5xl font-bold mb-6">
              Sign In or Create Account
            </h1>
            <p className="text-xl text-muted-foreground max-w-3xl mx-auto">
              Create an account to register for events, access member features, and stay connected with the COhere community.
            </p>
          </div>

          <AuthTabs />
        </div>
      </section>

      <Footer />
    </div>
  );
};

export default Auth;