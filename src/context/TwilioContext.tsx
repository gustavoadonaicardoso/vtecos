"use client";

import React, { createContext, useContext, useState } from 'react';

interface TwilioContextType {
  isDialerOpen: boolean;
  openDialer: () => void;
  closeDialer: () => void;
  toggleDialer: () => void;
}

const TwilioContext = createContext<TwilioContextType | undefined>(undefined);

export function TwilioProvider({ children }: { children: React.ReactNode }) {
  const [isDialerOpen, setIsDialerOpen] = useState(false);

  const openDialer = () => setIsDialerOpen(true);
  const closeDialer = () => setIsDialerOpen(false);
  const toggleDialer = () => setIsDialerOpen(prev => !prev);

  return (
    <TwilioContext.Provider value={{ isDialerOpen, openDialer, closeDialer, toggleDialer }}>
      {children}
    </TwilioContext.Provider>
  );
}

export function useTwilio() {
  const context = useContext(TwilioContext);
  if (context === undefined) {
    throw new Error('useTwilio must be used within a TwilioProvider');
  }
  return context;
}
