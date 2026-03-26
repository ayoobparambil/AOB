import { expect, request as playwrightRequest } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';

type DeployPayload = {
  accessCode: string;
  db4Type: string;
  reference: string;
  patient: {
    name: string;
    dob: string;
    mobile: string;
    medicareNo: string;
    medicareIrn: string;
    address: string;
  };
  location: {
    id: string;
    name: string;
    address: string;
  };
  provider: {
    name: string;
    number: string;
  };
  referrer: {
    name: string;
    number: string;
    date: string;
    period: string;
  };
  payee: {
    name: string;
    number: string;
    acrf: string;
  };
  services: Array<{
    date: string;
    itemNo: string;
    benefitAssigned: string;
    description: string;
  }>;
  agreementDate: string;
};

function randomBetween(min: number, max: number) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

async function humanPause(page: any, min: number, max: number) {
  const delay = randomBetween(min, max);
  await page.waitForTimeout(delay);
}

function appendUsageLog(tenantId: string, apiKey: string, reference: string) {
  const logPath = path.resolve(process.cwd(), 'vu-data-usage.log');
  const timestamp = new Date().toISOString();

  const maskedApiKey =
    apiKey.length > 16
      ? `${apiKey.slice(0, 8)}...${apiKey.slice(-8)}`
      : apiKey;

  fs.appendFileSync(
    logPath,
    `[${timestamp}] tenantId=${tenantId}, apiKey=${maskedApiKey}, reference=${reference}\n`,
    'utf8'
  );
}

function parsePayloadJson(rawPayloadJson: string): DeployPayload {
  try {
    return JSON.parse(rawPayloadJson) as DeployPayload;
  } catch (error) {
    throw new Error(`Failed to parse payloadJson from deploy.csv. Value: ${rawPayloadJson}`);
  }
}

export async function deployAndCompleteAob(
  page: any,
  vuContext: any,
  _events: any
) {
  const deployEndpoint =
    'https://stage.bponline.dev/api/pracsvcs/forms/templates/aob/$deploy';

  const tenantId = String(vuContext?.vars?.TenantId ?? '').trim();
  const bearerToken = String(vuContext?.vars?.APIKey ?? '').trim();
  const rawPayloadJson = String(vuContext?.vars?.payloadJson ?? '').trim();

  if (!tenantId) {
    throw new Error('Missing TenantId from deploy.csv row.');
  }

  if (!bearerToken) {
    throw new Error(`Missing APIKey from deploy.csv row for tenant ${tenantId}.`);
  }

  if (!rawPayloadJson) {
    throw new Error(`Missing payloadJson from deploy.csv row for tenant ${tenantId}.`);
  }

  const payload = parsePayloadJson(rawPayloadJson);

  appendUsageLog(tenantId, bearerToken, payload.reference);

  const apiContext = await playwrightRequest.newContext({
    extraHTTPHeaders: {
      Authorization: `Bearer ${bearerToken}`,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
  });

  try {
    const deployResponse = await apiContext.post(deployEndpoint, {
      data: payload,
    });

    const status = deployResponse.status();
    const responseText = await deployResponse.text();

    if (status < 200 || status >= 300) {
      throw new Error(
        `Deploy failed. Tenant=${tenantId}, Reference=${payload.reference}, Status=${status}, Body=${responseText}`
      );
    }

    const deployJson = JSON.parse(responseText);
    const formUrl = deployJson.url as string;

    expect(formUrl).toBeTruthy();

    await page.goto(formUrl, {
      waitUntil: 'domcontentloaded',
      timeout: 60000,
    });

    await humanPause(page, 2000, 5000);

    const q1 = page.getByRole('textbox', {
      name: 'Is the patient the assignor?',
    });
    await expect(q1).toBeVisible();

    await humanPause(page, 1000, 2000);
    await q1.getByText(/^Yes$/).click();

    await humanPause(page, 800, 1800);

    const q2 = page.getByRole('textbox', {
      name: 'Do you consent to assign the medicare benefit?',
    });
    await expect(q2).toBeVisible();

    await humanPause(page, 1000, 2000);
    await q2.getByText(/^Approve$/).click();

    await humanPause(page, 800, 1500);

    await page.getByRole('button', { name: /complete/i }).click();

    await humanPause(page, 1500, 3000);

    await expect(
      page.getByText('Thank you for updating your details.')
    ).toBeVisible();

    await expect(
      page.getByText('Please contact the practice if you have any questions.')
    ).toBeVisible();
  } finally {
    await apiContext.dispose();
  }
}