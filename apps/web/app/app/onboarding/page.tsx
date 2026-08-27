'use client';

import { Suspense, useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ProgressBar, Page, BlockStack } from '@shopify/polaris';
import type { OnboardingState, SyncStatus } from '@drsell/shared';
import { useShopSession } from '@/hooks/useShopSession';
import {
  fetchOnboarding,
  fetchSyncStatus,
  patchOnboarding,
  startBatchSync,
} from '@/lib/onboarding';
import { WelcomeStep } from './steps/WelcomeStep';
import { SyncStep } from './steps/SyncStep';
import { WidgetStep } from './steps/WidgetStep';
import { CompleteStep } from './steps/CompleteStep';

function OnboardingWizardInner() {
  const router = useRouter();
  const { shop, token, ready } = useShopSession();
  const [step, setStep] = useState<'1' | '2' | '3' | '5'>('1');
  const [color, setColor] = useState('#008060');
  const [position, setPosition] = useState<'bottom-right' | 'bottom-left'>('bottom-right');
  const [welcome, setWelcome] = useState('Hi! How can I help you today?');
  const [syncProducts, setSyncProducts] = useState(true);
  const [syncOrders, setSyncOrders] = useState(true);
  const [syncCustomers, setSyncCustomers] = useState(true);
  const [syncStatus, setSyncStatus] = useState<SyncStatus | null>(null);

  const load = useCallback(async () => {
    if (!shop || !token) return;
    const state = await fetchOnboarding(shop, token);
    if (state.step === 'done') {
      router.replace('/app');
      return;
    }
    if (state.step === '5') setStep('5');
    else if (state.step === '3') setStep('3');
    else if (state.step === '2') setStep('2');
    else setStep('1');
    setColor(state.widgetPrimaryColor);
    setPosition(state.widgetPosition);
    setWelcome(state.welcomeMessage || welcome);
    setSyncProducts(state.syncProductsEnabled);
    setSyncOrders(state.syncOrdersEnabled);
    setSyncCustomers(state.syncCustomersEnabled);
  }, [shop, token, router, welcome]);

  useEffect(() => {
    if (ready && shop && token) void load();
  }, [ready, shop, token, load]);

  useEffect(() => {
    if (!shop || !token || step === '1') return;
    const tick = () => {
      void fetchSyncStatus(shop, token).then(setSyncStatus).catch(() => undefined);
    };
    tick();
    const id = setInterval(tick, 4000);
    return () => clearInterval(id);
  }, [shop, token, step]);

  const progress =
    step === '1' ? 25 : step === '2' ? 50 : step === '3' ? 75 : 100;

  const goStep2 = async () => {
    if (!shop || !token) return;
    await patchOnboarding(shop, token, { step: '2' });
    setStep('2');
  };

  const skipToWidget = async () => {
    if (!shop || !token) return;
    await patchOnboarding(shop, token, { step: '3' });
    setStep('3');
  };

  const continueFromSync = async () => {
    if (!shop || !token) return;
    await patchOnboarding(shop, token, {
      step: '3',
      syncProductsEnabled: syncProducts,
      syncOrdersEnabled: syncOrders,
      syncCustomersEnabled: syncCustomers,
    });
    void startBatchSync(shop, token);
    setStep('3');
  };

  const saveWidget = async (patch: {
    color?: string;
    position?: 'bottom-right' | 'bottom-left';
    welcome?: string;
  }) => {
    if (patch.color) setColor(patch.color);
    if (patch.position) setPosition(patch.position);
    if (patch.welcome) setWelcome(patch.welcome);
    if (!shop || !token) return;
    await patchOnboarding(shop, token, {
      widgetPrimaryColor: patch.color ?? color,
      widgetPosition: patch.position ?? position,
      welcomeMessage: patch.welcome ?? welcome,
    });
  };

  const onLive = async () => {
    if (!shop || !token) return;
    await patchOnboarding(shop, token, { markEmbedLive: true });
    setStep('5');
  };

  const finish = async () => {
    if (!shop || !token) return;
    await patchOnboarding(shop, token, { complete: true });
    router.push('/app');
  };

  if (!ready || !shop) {
    return <p>Loading…</p>;
  }

  return (
    <Page title="Drsell Setup" narrowWidth>
      <BlockStack gap="500">
        <ProgressBar progress={progress} size="small" />
        {step === '1' && (
          <WelcomeStep onStart={() => void goStep2()} onSkip={() => void skipToWidget()} />
        )}
        {step === '2' && (
          <SyncStep
            syncProducts={syncProducts}
            syncOrders={syncOrders}
            syncCustomers={syncCustomers}
            onToggle={(key, v) => {
              if (key === 'products') setSyncProducts(v);
              if (key === 'orders') setSyncOrders(v);
              if (key === 'customers') setSyncCustomers(v);
            }}
            syncStatus={syncStatus}
            onContinue={() => void continueFromSync()}
          />
        )}
        {step === '3' && (
          <WidgetStep
            color={color}
            position={position}
            welcome={welcome}
            onChange={(p) => void saveWidget(p)}
            onLive={() => void onLive()}
          />
        )}
        {step === '5' && <CompleteStep shop={shop} onDone={() => void finish()} />}
      </BlockStack>
    </Page>
  );
}

export default function OnboardingPage() {
  return (
    <Suspense fallback={<p>Loading…</p>}>
      <OnboardingWizardInner />
    </Suspense>
  );
}
