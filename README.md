## Introduction

This project is for running performance tests for the AOB forms workflow using **Artillery** and **Playwright**.

Artillery enables distributed load testing, while Playwright drives real browser interactions to simulate realistic user behaviour.  
Each virtual user:

- deploys a form via API
- navigates to the returned form URL
- completes the form
- verifies successful submission

Synthetic test data is generated dynamically to support scalable and repeatable runs.

---

## Prerequisites

- Node.js (v20 or higher)
- npm
- Playwright browsers

---

## Setup

Clone the repository and navigate to the project directory:

Clone the repository and navigate to the directory:

````bash
 cd Bps.PerformanceTests.AOB
 ```


Install dependencies:
```bash
npm install
````

📂 All relevant test data need to be stored in the root subfolder as CSV files. This includes account tenant data and additional generated synthetic data.

**Please note:** test data will need to be scrubbed at teardown. New test data should be generated and used prior to new phases of performance testing.

## Running Tests

Generate test data with:
`bash
    npm run generate:deploy
    `

Run the load tests with:
`bash
    npm run test:load
    `

Generate a report from test results:
`bash
    npm run report:load
    `

## Configuration

- Modify `tests/loadTest.yml` to adjust test scenarios and phases
- Update `loginFlow.ts` to modify the login flow behavior
