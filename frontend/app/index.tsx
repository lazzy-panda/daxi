import React, { useEffect } from 'react';
import { Redirect } from 'expo-router';
import { useAuthContext } from '../context/AuthContext';
import { LoadingSpinner } from '../components/LoadingSpinner';

export default function Index() {
  const { isAuthenticated, isLoading, user } = useAuthContext();

  if (isLoading) {
    return <LoadingSpinner fullScreen message="Loading Daxi..." />;
  }

  if (!isAuthenticated) {
    return <Redirect href="/(auth)/login" />;
  }

  if (user?.role === 'curator') {
    return <Redirect href="/(curator)" />;
  }

  return <Redirect href="/(examinee)" />;
}
