'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { getAccessToken, getRefreshToken, syncAuthCookieFromStorage } from '@/app/lib/auth';

const CONNECT_COMPLETE_MESSAGE = 'applyai.connect.complete';
const CONNECT_NONCE_QUERY = 'nonce';
const CONNECT_EXTENSION_ID_QUERY = 'ext';

const EXTENSION_ID_PATTERN = /^[a-p]{32}$/;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type ConnectStatus = 'connecting' | 'success' | 'error';

type ConnectResponse = {
  ok?: boolean;
  error?: string;
};

type ChromeRuntimeBridge = {
  sendMessage?: (
    extensionId: string,
    message: unknown,
    callback?: (response?: ConnectResponse) => void
  ) => void;
  lastError?: { message?: string };
};

type WindowWithChrome = Window & {
  chrome?: {
    runtime?: ChromeRuntimeBridge;
  };
};

function getChromeRuntime(): ChromeRuntimeBridge | undefined {
  return (window as WindowWithChrome).chrome?.runtime;
}

async function sendConnectMessage(
  extensionId: string,
  nonce: string,
  accessToken: string,
  refreshToken: string
): Promise<void> {
  const runtime = getChromeRuntime();
  if (!runtime?.sendMessage) {
    throw new Error('ApplyAI extension runtime is not available in this tab.');
  }

  const sendMessage = runtime.sendMessage;

  await new Promise<void>((resolve, reject) => {
    const timeoutId = window.setTimeout(() => {
      reject(new Error('Timed out waiting for extension response.'));
    }, 10000);

    try {
      sendMessage(
        extensionId,
        {
          type: CONNECT_COMPLETE_MESSAGE,
          payload: {
            nonce,
            accessToken,
            refreshToken,
          },
        },
        (response?: ConnectResponse) => {
          window.clearTimeout(timeoutId);

          const runtimeError = runtime.lastError?.message;
          if (runtimeError) {
            reject(new Error(runtimeError));
            return;
          }

          if (!response?.ok) {
            reject(new Error(response?.error || 'Extension rejected connection request.'));
            return;
          }

          resolve();
        }
      );
    } catch (error) {
      window.clearTimeout(timeoutId);
      reject(error);
    }
  });
}

export default function ExtensionConnectPage() {
  const [status, setStatus] = useState<ConnectStatus>('connecting');
  const [message, setMessage] = useState('Completing secure extension handshake...');
  const startedRef = useRef(false);

  useEffect(() => {
    if (startedRef.current) {
      return;
    }
    startedRef.current = true;

    const completeHandshake = async () => {
      const params = new URLSearchParams(window.location.search);
      const nonce = params.get(CONNECT_NONCE_QUERY);
      const extensionId = params.get(CONNECT_EXTENSION_ID_QUERY);

      if (!nonce || !extensionId || !UUID_PATTERN.test(nonce) || !EXTENSION_ID_PATTERN.test(extensionId)) {
        setStatus('error');
        setMessage('Invalid or missing connect parameters. Restart connect from the extension popup.');
        return;
      }

      syncAuthCookieFromStorage();

      const accessToken = getAccessToken();
      const refreshToken = getRefreshToken();

      if (!accessToken || !refreshToken) {
        setStatus('error');
        setMessage('You need to sign in before connecting the extension.');
        return;
      }

      try {
        await sendConnectMessage(extensionId, nonce, accessToken, refreshToken);
        setStatus('success');
        setMessage('Extension connected. You can close this tab and return to your application form.');
      } catch (error) {
        const detail = error instanceof Error ? error.message : 'Unknown error';
        setStatus('error');
        setMessage(`Connection failed: ${detail}`);
      }
    };

    void completeHandshake();
  }, []);

  const bannerClass =
    status === 'success'
      ? 'banner banner--success'
      : status === 'error'
        ? 'banner banner--error'
        : 'banner banner--info';

  return (
    <div className="onboard">
      <div className="page-header">
        <h1>Connect Chrome Extension</h1>
        <p>Complete the secure handshake between your ApplyAI account and browser extension.</p>
      </div>

      <div className="onboard__card">
        <div className={bannerClass}>{message}</div>

        <div className="onboard__actions">
          {status === 'success' && (
            <>
              <button
                type="button"
                className="btn btn--secondary"
                onClick={() => {
                  window.close();
                }}
              >
                Close Tab
              </button>
              <Link href="/dashboard" className="btn btn--primary">
                Back to Dashboard
              </Link>
            </>
          )}

          {status === 'error' && (
            <>
              <Link href="/login" className="btn btn--secondary">
                Sign In
              </Link>
              <Link href="/dashboard" className="btn btn--primary">
                Open Dashboard
              </Link>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
