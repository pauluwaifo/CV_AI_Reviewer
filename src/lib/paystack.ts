import "server-only";

const PAYSTACK_BASE_URL = "https://api.paystack.co";

export async function initializePaystackTransaction(input: {
  amountKobo: number;
  callbackUrl: string;
  currency?: string;
  email: string;
  metadata?: Record<string, unknown>;
  planCode?: string;
  reference: string;
}) {
  const secretKey = getPaystackSecretKey();

  const response = await fetch(`${PAYSTACK_BASE_URL}/transaction/initialize`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${secretKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      amount: String(Math.max(0, Math.round(input.amountKobo))),
      callback_url: input.callbackUrl,
      currency: (input.currency || "NGN").trim().toUpperCase(),
      email: input.email.trim().toLowerCase(),
      metadata: input.metadata ?? {},
      ...(input.planCode?.trim() ? { plan: input.planCode.trim() } : {}),
      reference: input.reference.trim(),
    }),
    cache: "no-store",
  });

  const payload = (await response.json().catch(() => null)) as
    | {
        data?: {
          access_code?: string;
          authorization_url?: string;
          reference?: string;
        };
        message?: string;
        status?: boolean;
      }
    | null;

  if (!response.ok || !payload?.status || !payload.data?.authorization_url) {
    throw new Error(payload?.message || "Paystack could not initialize this transaction.");
  }

  return {
    accessCode: payload.data.access_code?.trim() || "",
    authorizationUrl: payload.data.authorization_url.trim(),
    reference: payload.data.reference?.trim() || input.reference.trim(),
  };
}

export async function verifyPaystackTransaction(reference: string) {
  const secretKey = getPaystackSecretKey();

  const response = await fetch(
    `${PAYSTACK_BASE_URL}/transaction/verify/${encodeURIComponent(reference.trim())}`,
    {
      headers: {
        Authorization: `Bearer ${secretKey}`,
      },
      cache: "no-store",
    }
  );

  const payload = (await response.json().catch(() => null)) as
    | {
        data?: Record<string, unknown> & {
          amount?: number;
          currency?: string;
          customer?: {
            email?: string;
          };
          paid_at?: string | null;
          reference?: string;
          status?: string;
        };
        message?: string;
        status?: boolean;
      }
    | null;

  if (!response.ok || !payload?.status || !payload.data) {
    throw new Error(payload?.message || "Paystack could not verify this transaction.");
  }

  return payload.data;
}

export function isPaystackConfigured() {
  return Boolean(
    process.env.PAYSTACK_SECRET_KEY?.trim() && process.env.PAYSTACK_PUBLIC_KEY?.trim()
  );
}

export function getPaystackPublicKey() {
  const publicKey = process.env.PAYSTACK_PUBLIC_KEY?.trim();

  if (!publicKey) {
    throw new Error(
      "PAYSTACK_PUBLIC_KEY is missing. Add it to your environment before enabling inline workspace billing."
    );
  }

  return publicKey;
}

function getPaystackSecretKey() {
  const secretKey = process.env.PAYSTACK_SECRET_KEY?.trim();

  if (!secretKey) {
    throw new Error(
      "PAYSTACK_SECRET_KEY is missing. Add it to your environment before activating workspace billing."
    );
  }

  return secretKey;
}
