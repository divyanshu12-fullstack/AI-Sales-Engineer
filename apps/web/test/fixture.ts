import { dashboardSchema } from '@asterbyte/contracts';
import fixtureText from './fixtures/dashboard.json?raw';
export const dashboardFixture = dashboardSchema.parse(JSON.parse(fixtureText));
