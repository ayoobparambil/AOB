import fs from 'node:fs';
import path from 'node:path';
import Chance from 'chance';
import { parse } from 'csv-parse/sync';

const chance = new Chance();

// This is the number of deploy rows to generate.
// If it is larger than the number of tenant rows, tenant selection wraps around.
const arg = process.argv.find((a) => a.startsWith('--count='));
const Forms_deploy_count = Number(
    process.env.FORMS_DEPLOY_COUNT ??
    process.env.npm_config_count ??
    6000
);

type TenantRow = {
    TenantId: string;
    APIKey: string;
};

function formatDateDDMMYYYY(date: Date): string {
    const dd = String(date.getDate()).padStart(2, '0');
    const mm = String(date.getMonth() + 1).padStart(2, '0');
    const yyyy = date.getFullYear();
    return `${dd}/${mm}/${yyyy}`;
}

function randomDigits(length: number): string {
    let value = '';
    for (let i = 0; i < length; i++) {
        value += chance.integer({ min: 0, max: 9 }).toString();
    }
    return value;
}

function buildMockPayload() {
    const now = new Date();
    const today = formatDateDDMMYYYY(now);

    const patientFirst = chance.first();
    const patientLast = chance.last();
    const providerFirst = chance.first();
    const providerLast = chance.last();
    const referrerFirst = chance.first();
    const referrerLast = chance.last();
    const payeeFirst = chance.first();
    const payeeLast = chance.last();

    const providerTitle = chance.pickone(['Dr', 'Prof', 'A/Prof']);
    const referrerTitle = chance.pickone(['Dr', 'Prof']);
    const payeeTitle = chance.pickone(['Dr', 'Prof']);

    const patientName = `${patientFirst} ${patientLast}`;
    const providerName = `${providerTitle} ${providerFirst} ${providerLast}`;
    const referrerName = `${referrerTitle} ${referrerFirst} ${referrerLast}`;
    const payeeName = `${payeeTitle} ${payeeFirst} ${payeeLast}`;

    const dob = formatDateDDMMYYYY(
        chance.birthday({ type: 'adult', string: false }) as Date
    );

    const serviceDate = today;
    const agreementDate = today;
    const referralDate = today;

    const address = `${chance.address()}, ${chance.city()} QLD ${chance.postcode()}`;

    const itemNo = chance.pickone(['23', '36', '44', '5020', '721', '723']);
    const descriptionMap: Record<string, string> = {
        '23': 'Standard consult',
        '36': 'Long consult',
        '44': 'Prolonged consult',
        '5020': 'After hours consult',
        '721': 'GP management plan',
        '723': 'Team care arrangement',
    };

    const benefitAssigned = `$${chance.floating({
        min: 38,
        max: 190,
        fixed: 2,
    }).toFixed(2)}`;

    const payload = {
        accessCode: randomDigits(6),
        db4Type: chance.pickone(['pre', 'post']),
        reference: `REF-${chance.guid({ version: 4 }).slice(0, 8).toUpperCase()}`,
        patient: {
            name: patientName,
            dob,
            mobile: `04${randomDigits(8)}`,
            medicareNo: randomDigits(11),
            medicareIrn: String(chance.integer({ min: 1, max: 9 })),
            address,
        },
        location: {
            id: `BPS-${randomDigits(6)}`,
            name: `${chance.company()} Medical Centre`,
            address: `${chance.address()}, ${chance.city()} QLD ${chance.postcode()}`,
        },
        provider: {
            name: providerName,
            number: `${chance.character({ pool: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ' })}${randomDigits(10)}`,
        },
        referrer: {
            name: referrerName,
            number: `${chance.character({ pool: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ' })}${randomDigits(9)}`,
            date: referralDate,
            period: `${chance.integer({ min: 1, max: 25 })} years`,
        },
        payee: {
            name: payeeName,
            number: `${chance.character({ pool: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ' })}${randomDigits(8)}`,
            acrf: String(chance.integer({ min: 1, max: 9 })),
        },
        services: [
            {
                date: serviceDate,
                itemNo,
                benefitAssigned,
                description: descriptionMap[itemNo] ?? 'Standard consult',
            },
        ],
        agreementDate,
    };

    return payload;
}

function escapeCsv(value: unknown): string {
    const str = String(value ?? '');
    if (str.includes('"') || str.includes(',') || str.includes('\n') || str.includes('\r')) {
        return `"${str.replace(/"/g, '""')}"`;
    }
    return str;
}

function readTenantsCsv(filePath: string): TenantRow[] {
    const csvText = fs.readFileSync(filePath, 'utf8');

    const rows = parse(csvText, {
        columns: true,
        skip_empty_lines: true,
        trim: true,
    }) as TenantRow[];

    return rows.filter((row) => row.TenantId && row.APIKey);
}

function main() {
    const rootDir = process.cwd();
    const tenantsPath = path.join(rootDir, 'tenants.csv');
    const deployPath = path.join(rootDir, 'deploy.csv');

    if (!fs.existsSync(tenantsPath)) {
        throw new Error(`Could not find tenants.csv at: ${tenantsPath}`);
    }

    const tenantRows = readTenantsCsv(tenantsPath);

    if (tenantRows.length === 0) {
        throw new Error('tenants.csv has no usable rows.');
    }

    const headers = [
        'DeployRowNumber',
        'TenantRowIndex',
        'TenantId',
        'APIKey',
        'accessCode',
        'db4Type',
        'reference',
        'patientName',
        'patientDob',
        'patientMobile',
        'patientMedicareNo',
        'patientMedicareIrn',
        'patientAddress',
        'locationId',
        'locationName',
        'locationAddress',
        'providerName',
        'providerNumber',
        'referrerName',
        'referrerNumber',
        'referrerDate',
        'referrerPeriod',
        'payeeName',
        'payeeNumber',
        'payeeAcrf',
        'serviceDate',
        'serviceItemNo',
        'serviceBenefitAssigned',
        'serviceDescription',
        'agreementDate',
        'payloadJson',
    ];

    const lines: string[] = [];
    lines.push(headers.map(escapeCsv).join(','));

    for (let i = 0; i < Forms_deploy_count; i++) {
        const tenantIndex = i % tenantRows.length;
        const tenant = tenantRows[tenantIndex];
        const payload = buildMockPayload();
        const service = payload.services[0];

        const row = [
            i + 1,
            tenantIndex + 1,
            tenant.TenantId,
            tenant.APIKey,
            payload.accessCode,
            payload.db4Type,
            payload.reference,
            payload.patient.name,
            payload.patient.dob,
            payload.patient.mobile,
            payload.patient.medicareNo,
            payload.patient.medicareIrn,
            payload.patient.address,
            payload.location.id,
            payload.location.name,
            payload.location.address,
            payload.provider.name,
            payload.provider.number,
            payload.referrer.name,
            payload.referrer.number,
            payload.referrer.date,
            payload.referrer.period,
            payload.payee.name,
            payload.payee.number,
            payload.payee.acrf,
            service.date,
            service.itemNo,
            service.benefitAssigned,
            service.description,
            payload.agreementDate,
            JSON.stringify(payload),
        ];

        lines.push(row.map(escapeCsv).join(','));
    }

    fs.writeFileSync(deployPath, lines.join('\n'), 'utf8');

    console.log(`Generated ${Forms_deploy_count} deploy rows.`);
    console.log(`Tenant source rows: ${tenantRows.length}`);
    console.log(`Output written to: ${deployPath}`);
}

main();