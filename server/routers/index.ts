import { router } from "../_core/context";
import { callsRouter } from "./calls";
import { inventoryRouter } from "./inventory";
import { teamRouter } from "./team";
import { gamificationRouter } from "./gamification";
import { kpiRouter } from "./kpi";
import { trainingRouter } from "./training";
import { aiRouter } from "./ai";
import { playbookRouter } from "./playbook";
import { actionsRouter } from "./actions";
import { authRouter } from "./auth";
import { settingsRouter } from "./settings";
import { todayRouter } from "./today";
import { notificationsRouter } from "./notifications";
import { usersRouter } from "./users";

export const appRouter = router({
  calls: callsRouter,
  inventory: inventoryRouter,
  team: teamRouter,
  gamification: gamificationRouter,
  kpi: kpiRouter,
  training: trainingRouter,
  ai: aiRouter,
  playbook: playbookRouter,
  actions: actionsRouter,
  auth: authRouter,
  settings: settingsRouter,
  today: todayRouter,
  notifications: notificationsRouter,
  users: usersRouter,
});

export type AppRouter = typeof appRouter;
