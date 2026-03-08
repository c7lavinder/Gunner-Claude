import { relations } from "drizzle-orm/relations";
import { tenants, aiCoachPreferences, users, calls, aiFeedback, callGrades, teamMembers, badgeProgress, callNextSteps, coachActionEdits, coachActionLog, coachMessages, contactCache, socialPosts, contentIdeas, dailyKpiEntries, deals, dispoDailyKpis, dispoProperties, dispoPropertyOffers, dispoPropertySends, dispoPropertyShowings, emailVerificationTokens, emailsSent, ghlOauthTokens, opportunities, outreachHistory, passwordResetTokens, pendingInvitations, performanceMetrics, propertyActivityLog, propertyBuyerActivity, propertyStageHistory, rewardViews, syncLog, teamAssignments, teamTrainingItems, tenantCallTypes, tenantRubrics, tenantRoles, userBadges, badges, userInstructions, userStreaks, userXp, webhookEvents, webhookRetryQueue, xpTransactions } from "./schema";

export const aiCoachPreferencesRelations = relations(aiCoachPreferences, ({one}) => ({
	tenant: one(tenants, {
		fields: [aiCoachPreferences.tenantId],
		references: [tenants.id]
	}),
	user: one(users, {
		fields: [aiCoachPreferences.userId],
		references: [users.id]
	}),
}));

export const tenantsRelations = relations(tenants, ({many}) => ({
	aiCoachPreferences: many(aiCoachPreferences),
	callNextSteps: many(callNextSteps),
	coachActionEdits: many(coachActionEdits),
	coachActionLogs: many(coachActionLog),
	coachMessages: many(coachMessages),
	contactCaches: many(contactCache),
	dailyKpiEntries: many(dailyKpiEntries),
	dispoDailyKpis_tenantId: many(dispoDailyKpis, {
		relationName: "dispoDailyKpis_tenantId_tenants_id"
	}),
	dispoDailyKpis_tenantId: many(dispoDailyKpis, {
		relationName: "dispoDailyKpis_tenantId_tenants_id"
	}),
	dispoProperties_tenantId: many(dispoProperties, {
		relationName: "dispoProperties_tenantId_tenants_id"
	}),
	dispoProperties_tenantId: many(dispoProperties, {
		relationName: "dispoProperties_tenantId_tenants_id"
	}),
	dispoPropertyOffers_tenantId: many(dispoPropertyOffers, {
		relationName: "dispoPropertyOffers_tenantId_tenants_id"
	}),
	dispoPropertyOffers_tenantId: many(dispoPropertyOffers, {
		relationName: "dispoPropertyOffers_tenantId_tenants_id"
	}),
	dispoPropertySends_tenantId: many(dispoPropertySends, {
		relationName: "dispoPropertySends_tenantId_tenants_id"
	}),
	dispoPropertySends_tenantId: many(dispoPropertySends, {
		relationName: "dispoPropertySends_tenantId_tenants_id"
	}),
	dispoPropertyShowings_tenantId: many(dispoPropertyShowings, {
		relationName: "dispoPropertyShowings_tenantId_tenants_id"
	}),
	dispoPropertyShowings_tenantId: many(dispoPropertyShowings, {
		relationName: "dispoPropertyShowings_tenantId_tenants_id"
	}),
	ghlOauthTokens: many(ghlOauthTokens),
	opportunities: many(opportunities),
	outreachHistories: many(outreachHistory),
	pendingInvitations: many(pendingInvitations),
	propertyActivityLogs_tenantId: many(propertyActivityLog, {
		relationName: "propertyActivityLog_tenantId_tenants_id"
	}),
	propertyActivityLogs_tenantId: many(propertyActivityLog, {
		relationName: "propertyActivityLog_tenantId_tenants_id"
	}),
	propertyBuyerActivities_tenantId: many(propertyBuyerActivity, {
		relationName: "propertyBuyerActivity_tenantId_tenants_id"
	}),
	propertyBuyerActivities_tenantId: many(propertyBuyerActivity, {
		relationName: "propertyBuyerActivity_tenantId_tenants_id"
	}),
	propertyStageHistories: many(propertyStageHistory),
	syncLogs: many(syncLog),
	tenantCallTypes: many(tenantCallTypes),
	tenantRoles: many(tenantRoles),
	tenantRubrics: many(tenantRubrics),
	webhookEvents: many(webhookEvents),
	webhookRetryQueues: many(webhookRetryQueue),
}));

export const usersRelations = relations(users, ({many}) => ({
	aiCoachPreferences: many(aiCoachPreferences),
	aiFeedbacks: many(aiFeedback),
	coachActionEdits: many(coachActionEdits),
	coachActionLogs: many(coachActionLog),
	coachMessages: many(coachMessages),
	dailyKpiEntries: many(dailyKpiEntries),
	dispoProperties_assignedAmUserId: many(dispoProperties, {
		relationName: "dispoProperties_assignedAmUserId_users_id"
	}),
	dispoProperties_assignedLmUserId: many(dispoProperties, {
		relationName: "dispoProperties_assignedLmUserId_users_id"
	}),
	dispoProperties_addedByUserId: many(dispoProperties, {
		relationName: "dispoProperties_addedByUserId_users_id"
	}),
	dispoProperties_assignedToUserId: many(dispoProperties, {
		relationName: "dispoProperties_assignedToUserId_users_id"
	}),
	dispoPropertySends: many(dispoPropertySends),
	emailVerificationTokens: many(emailVerificationTokens),
	emailsSents: many(emailsSent),
	opportunities: many(opportunities),
	outreachHistories: many(outreachHistory),
	passwordResetTokens: many(passwordResetTokens),
	pendingInvitations_invitedBy: many(pendingInvitations, {
		relationName: "pendingInvitations_invitedBy_users_id"
	}),
	pendingInvitations_acceptedByUserId: many(pendingInvitations, {
		relationName: "pendingInvitations_acceptedByUserId_users_id"
	}),
	propertyActivityLogs_performedByUserId: many(propertyActivityLog, {
		relationName: "propertyActivityLog_performedByUserId_users_id"
	}),
	propertyActivityLogs_performedByUserId: many(propertyActivityLog, {
		relationName: "propertyActivityLog_performedByUserId_users_id"
	}),
	propertyStageHistories: many(propertyStageHistory),
	socialPosts: many(socialPosts),
	teamMembers: many(teamMembers),
	userInstructions: many(userInstructions),
}));

export const aiFeedbackRelations = relations(aiFeedback, ({one}) => ({
	call: one(calls, {
		fields: [aiFeedback.callId],
		references: [calls.id]
	}),
	callGrade: one(callGrades, {
		fields: [aiFeedback.callGradeId],
		references: [callGrades.id]
	}),
	user: one(users, {
		fields: [aiFeedback.userId],
		references: [users.id]
	}),
}));

export const callsRelations = relations(calls, ({one, many}) => ({
	aiFeedbacks: many(aiFeedback),
	callGrades: many(callGrades),
	callNextSteps: many(callNextSteps),
	teamMember: one(teamMembers, {
		fields: [calls.teamMemberId],
		references: [teamMembers.id]
	}),
	deals: many(deals),
	opportunities: many(opportunities),
	rewardViews: many(rewardViews),
	teamTrainingItems: many(teamTrainingItems),
	userBadges: many(userBadges),
	webhookRetryQueues: many(webhookRetryQueue),
	xpTransactions: many(xpTransactions),
}));

export const callGradesRelations = relations(callGrades, ({one, many}) => ({
	aiFeedbacks: many(aiFeedback),
	call: one(calls, {
		fields: [callGrades.callId],
		references: [calls.id]
	}),
}));

export const badgeProgressRelations = relations(badgeProgress, ({one}) => ({
	teamMember: one(teamMembers, {
		fields: [badgeProgress.teamMemberId],
		references: [teamMembers.id]
	}),
}));

export const teamMembersRelations = relations(teamMembers, ({one, many}) => ({
	badgeProgresses: many(badgeProgress),
	calls: many(calls),
	deals: many(deals),
	opportunities: many(opportunities),
	performanceMetrics: many(performanceMetrics),
	rewardViews: many(rewardViews),
	teamAssignments_leadManagerId: many(teamAssignments, {
		relationName: "teamAssignments_leadManagerId_teamMembers_id"
	}),
	teamAssignments_acquisitionManagerId: many(teamAssignments, {
		relationName: "teamAssignments_acquisitionManagerId_teamMembers_id"
	}),
	user: one(users, {
		fields: [teamMembers.userId],
		references: [users.id]
	}),
	teamTrainingItems: many(teamTrainingItems),
	userBadges: many(userBadges),
	userStreaks: many(userStreaks),
	userXps: many(userXp),
	xpTransactions: many(xpTransactions),
}));

export const callNextStepsRelations = relations(callNextSteps, ({one}) => ({
	call: one(calls, {
		fields: [callNextSteps.callId],
		references: [calls.id]
	}),
	tenant: one(tenants, {
		fields: [callNextSteps.tenantId],
		references: [tenants.id]
	}),
}));

export const coachActionEditsRelations = relations(coachActionEdits, ({one}) => ({
	tenant: one(tenants, {
		fields: [coachActionEdits.tenantId],
		references: [tenants.id]
	}),
	user: one(users, {
		fields: [coachActionEdits.userId],
		references: [users.id]
	}),
	coachActionLog: one(coachActionLog, {
		fields: [coachActionEdits.actionLogId],
		references: [coachActionLog.id]
	}),
}));

export const coachActionLogRelations = relations(coachActionLog, ({one, many}) => ({
	coachActionEdits: many(coachActionEdits),
	tenant: one(tenants, {
		fields: [coachActionLog.tenantId],
		references: [tenants.id]
	}),
	user: one(users, {
		fields: [coachActionLog.requestedBy],
		references: [users.id]
	}),
}));

export const coachMessagesRelations = relations(coachMessages, ({one}) => ({
	tenant: one(tenants, {
		fields: [coachMessages.tenantId],
		references: [tenants.id]
	}),
	user: one(users, {
		fields: [coachMessages.userId],
		references: [users.id]
	}),
}));

export const contactCacheRelations = relations(contactCache, ({one}) => ({
	tenant: one(tenants, {
		fields: [contactCache.tenantId],
		references: [tenants.id]
	}),
}));

export const contentIdeasRelations = relations(contentIdeas, ({one}) => ({
	socialPost: one(socialPosts, {
		fields: [contentIdeas.usedInPostId],
		references: [socialPosts.id]
	}),
}));

export const socialPostsRelations = relations(socialPosts, ({one, many}) => ({
	contentIdeas: many(contentIdeas),
	user: one(users, {
		fields: [socialPosts.createdBy],
		references: [users.id]
	}),
}));

export const dailyKpiEntriesRelations = relations(dailyKpiEntries, ({one}) => ({
	tenant: one(tenants, {
		fields: [dailyKpiEntries.tenantId],
		references: [tenants.id]
	}),
	user: one(users, {
		fields: [dailyKpiEntries.userId],
		references: [users.id]
	}),
}));

export const dealsRelations = relations(deals, ({one}) => ({
	teamMember: one(teamMembers, {
		fields: [deals.teamMemberId],
		references: [teamMembers.id]
	}),
	call: one(calls, {
		fields: [deals.offerCallId],
		references: [calls.id]
	}),
}));

export const dispoDailyKpisRelations = relations(dispoDailyKpis, ({one}) => ({
	tenant_tenantId: one(tenants, {
		fields: [dispoDailyKpis.tenantId],
		references: [tenants.id],
		relationName: "dispoDailyKpis_tenantId_tenants_id"
	}),
	dispoProperty_propertyId: one(dispoProperties, {
		fields: [dispoDailyKpis.propertyId],
		references: [dispoProperties.id],
		relationName: "dispoDailyKpis_propertyId_dispoProperties_id"
	}),
	tenant_tenantId: one(tenants, {
		fields: [dispoDailyKpis.tenantId],
		references: [tenants.id],
		relationName: "dispoDailyKpis_tenantId_tenants_id"
	}),
	dispoProperty_propertyId: one(dispoProperties, {
		fields: [dispoDailyKpis.propertyId],
		references: [dispoProperties.id],
		relationName: "dispoDailyKpis_propertyId_dispoProperties_id"
	}),
}));

export const dispoPropertiesRelations = relations(dispoProperties, ({one, many}) => ({
	dispoDailyKpis_propertyId: many(dispoDailyKpis, {
		relationName: "dispoDailyKpis_propertyId_dispoProperties_id"
	}),
	dispoDailyKpis_propertyId: many(dispoDailyKpis, {
		relationName: "dispoDailyKpis_propertyId_dispoProperties_id"
	}),
	tenant_tenantId: one(tenants, {
		fields: [dispoProperties.tenantId],
		references: [tenants.id],
		relationName: "dispoProperties_tenantId_tenants_id"
	}),
	user_assignedAmUserId: one(users, {
		fields: [dispoProperties.assignedAmUserId],
		references: [users.id],
		relationName: "dispoProperties_assignedAmUserId_users_id"
	}),
	user_assignedLmUserId: one(users, {
		fields: [dispoProperties.assignedLmUserId],
		references: [users.id],
		relationName: "dispoProperties_assignedLmUserId_users_id"
	}),
	tenant_tenantId: one(tenants, {
		fields: [dispoProperties.tenantId],
		references: [tenants.id],
		relationName: "dispoProperties_tenantId_tenants_id"
	}),
	user_addedByUserId: one(users, {
		fields: [dispoProperties.addedByUserId],
		references: [users.id],
		relationName: "dispoProperties_addedByUserId_users_id"
	}),
	user_assignedToUserId: one(users, {
		fields: [dispoProperties.assignedToUserId],
		references: [users.id],
		relationName: "dispoProperties_assignedToUserId_users_id"
	}),
	dispoPropertyOffers_propertyId: many(dispoPropertyOffers, {
		relationName: "dispoPropertyOffers_propertyId_dispoProperties_id"
	}),
	dispoPropertyOffers_propertyId: many(dispoPropertyOffers, {
		relationName: "dispoPropertyOffers_propertyId_dispoProperties_id"
	}),
	dispoPropertySends_propertyId: many(dispoPropertySends, {
		relationName: "dispoPropertySends_propertyId_dispoProperties_id"
	}),
	dispoPropertySends_propertyId: many(dispoPropertySends, {
		relationName: "dispoPropertySends_propertyId_dispoProperties_id"
	}),
	dispoPropertyShowings_propertyId: many(dispoPropertyShowings, {
		relationName: "dispoPropertyShowings_propertyId_dispoProperties_id"
	}),
	dispoPropertyShowings_propertyId: many(dispoPropertyShowings, {
		relationName: "dispoPropertyShowings_propertyId_dispoProperties_id"
	}),
	propertyActivityLogs_propertyId: many(propertyActivityLog, {
		relationName: "propertyActivityLog_propertyId_dispoProperties_id"
	}),
	propertyActivityLogs_propertyId: many(propertyActivityLog, {
		relationName: "propertyActivityLog_propertyId_dispoProperties_id"
	}),
	propertyBuyerActivities_propertyId: many(propertyBuyerActivity, {
		relationName: "propertyBuyerActivity_propertyId_dispoProperties_id"
	}),
	propertyBuyerActivities_propertyId: many(propertyBuyerActivity, {
		relationName: "propertyBuyerActivity_propertyId_dispoProperties_id"
	}),
	propertyStageHistories: many(propertyStageHistory),
}));

export const dispoPropertyOffersRelations = relations(dispoPropertyOffers, ({one}) => ({
	tenant_tenantId: one(tenants, {
		fields: [dispoPropertyOffers.tenantId],
		references: [tenants.id],
		relationName: "dispoPropertyOffers_tenantId_tenants_id"
	}),
	dispoProperty_propertyId: one(dispoProperties, {
		fields: [dispoPropertyOffers.propertyId],
		references: [dispoProperties.id],
		relationName: "dispoPropertyOffers_propertyId_dispoProperties_id"
	}),
	tenant_tenantId: one(tenants, {
		fields: [dispoPropertyOffers.tenantId],
		references: [tenants.id],
		relationName: "dispoPropertyOffers_tenantId_tenants_id"
	}),
	dispoProperty_propertyId: one(dispoProperties, {
		fields: [dispoPropertyOffers.propertyId],
		references: [dispoProperties.id],
		relationName: "dispoPropertyOffers_propertyId_dispoProperties_id"
	}),
}));

export const dispoPropertySendsRelations = relations(dispoPropertySends, ({one}) => ({
	tenant_tenantId: one(tenants, {
		fields: [dispoPropertySends.tenantId],
		references: [tenants.id],
		relationName: "dispoPropertySends_tenantId_tenants_id"
	}),
	dispoProperty_propertyId: one(dispoProperties, {
		fields: [dispoPropertySends.propertyId],
		references: [dispoProperties.id],
		relationName: "dispoPropertySends_propertyId_dispoProperties_id"
	}),
	tenant_tenantId: one(tenants, {
		fields: [dispoPropertySends.tenantId],
		references: [tenants.id],
		relationName: "dispoPropertySends_tenantId_tenants_id"
	}),
	dispoProperty_propertyId: one(dispoProperties, {
		fields: [dispoPropertySends.propertyId],
		references: [dispoProperties.id],
		relationName: "dispoPropertySends_propertyId_dispoProperties_id"
	}),
	user: one(users, {
		fields: [dispoPropertySends.sentByUserId],
		references: [users.id]
	}),
}));

export const dispoPropertyShowingsRelations = relations(dispoPropertyShowings, ({one}) => ({
	tenant_tenantId: one(tenants, {
		fields: [dispoPropertyShowings.tenantId],
		references: [tenants.id],
		relationName: "dispoPropertyShowings_tenantId_tenants_id"
	}),
	dispoProperty_propertyId: one(dispoProperties, {
		fields: [dispoPropertyShowings.propertyId],
		references: [dispoProperties.id],
		relationName: "dispoPropertyShowings_propertyId_dispoProperties_id"
	}),
	tenant_tenantId: one(tenants, {
		fields: [dispoPropertyShowings.tenantId],
		references: [tenants.id],
		relationName: "dispoPropertyShowings_tenantId_tenants_id"
	}),
	dispoProperty_propertyId: one(dispoProperties, {
		fields: [dispoPropertyShowings.propertyId],
		references: [dispoProperties.id],
		relationName: "dispoPropertyShowings_propertyId_dispoProperties_id"
	}),
}));

export const emailVerificationTokensRelations = relations(emailVerificationTokens, ({one}) => ({
	user: one(users, {
		fields: [emailVerificationTokens.userId],
		references: [users.id]
	}),
}));

export const emailsSentRelations = relations(emailsSent, ({one}) => ({
	user: one(users, {
		fields: [emailsSent.userId],
		references: [users.id]
	}),
}));

export const ghlOauthTokensRelations = relations(ghlOauthTokens, ({one}) => ({
	tenant: one(tenants, {
		fields: [ghlOauthTokens.tenantId],
		references: [tenants.id]
	}),
}));

export const opportunitiesRelations = relations(opportunities, ({one}) => ({
	tenant: one(tenants, {
		fields: [opportunities.tenantId],
		references: [tenants.id]
	}),
	call: one(calls, {
		fields: [opportunities.relatedCallId],
		references: [calls.id]
	}),
	teamMember: one(teamMembers, {
		fields: [opportunities.teamMemberId],
		references: [teamMembers.id]
	}),
	user: one(users, {
		fields: [opportunities.resolvedBy],
		references: [users.id]
	}),
}));

export const outreachHistoryRelations = relations(outreachHistory, ({one}) => ({
	tenant: one(tenants, {
		fields: [outreachHistory.tenantId],
		references: [tenants.id]
	}),
	user: one(users, {
		fields: [outreachHistory.sentByUserId],
		references: [users.id]
	}),
}));

export const passwordResetTokensRelations = relations(passwordResetTokens, ({one}) => ({
	user: one(users, {
		fields: [passwordResetTokens.userId],
		references: [users.id]
	}),
}));

export const pendingInvitationsRelations = relations(pendingInvitations, ({one}) => ({
	tenant: one(tenants, {
		fields: [pendingInvitations.tenantId],
		references: [tenants.id]
	}),
	user_invitedBy: one(users, {
		fields: [pendingInvitations.invitedBy],
		references: [users.id],
		relationName: "pendingInvitations_invitedBy_users_id"
	}),
	user_acceptedByUserId: one(users, {
		fields: [pendingInvitations.acceptedByUserId],
		references: [users.id],
		relationName: "pendingInvitations_acceptedByUserId_users_id"
	}),
}));

export const performanceMetricsRelations = relations(performanceMetrics, ({one}) => ({
	teamMember: one(teamMembers, {
		fields: [performanceMetrics.teamMemberId],
		references: [teamMembers.id]
	}),
}));

export const propertyActivityLogRelations = relations(propertyActivityLog, ({one}) => ({
	tenant_tenantId: one(tenants, {
		fields: [propertyActivityLog.tenantId],
		references: [tenants.id],
		relationName: "propertyActivityLog_tenantId_tenants_id"
	}),
	dispoProperty_propertyId: one(dispoProperties, {
		fields: [propertyActivityLog.propertyId],
		references: [dispoProperties.id],
		relationName: "propertyActivityLog_propertyId_dispoProperties_id"
	}),
	user_performedByUserId: one(users, {
		fields: [propertyActivityLog.performedByUserId],
		references: [users.id],
		relationName: "propertyActivityLog_performedByUserId_users_id"
	}),
	tenant_tenantId: one(tenants, {
		fields: [propertyActivityLog.tenantId],
		references: [tenants.id],
		relationName: "propertyActivityLog_tenantId_tenants_id"
	}),
	dispoProperty_propertyId: one(dispoProperties, {
		fields: [propertyActivityLog.propertyId],
		references: [dispoProperties.id],
		relationName: "propertyActivityLog_propertyId_dispoProperties_id"
	}),
	user_performedByUserId: one(users, {
		fields: [propertyActivityLog.performedByUserId],
		references: [users.id],
		relationName: "propertyActivityLog_performedByUserId_users_id"
	}),
}));

export const propertyBuyerActivityRelations = relations(propertyBuyerActivity, ({one}) => ({
	tenant_tenantId: one(tenants, {
		fields: [propertyBuyerActivity.tenantId],
		references: [tenants.id],
		relationName: "propertyBuyerActivity_tenantId_tenants_id"
	}),
	dispoProperty_propertyId: one(dispoProperties, {
		fields: [propertyBuyerActivity.propertyId],
		references: [dispoProperties.id],
		relationName: "propertyBuyerActivity_propertyId_dispoProperties_id"
	}),
	tenant_tenantId: one(tenants, {
		fields: [propertyBuyerActivity.tenantId],
		references: [tenants.id],
		relationName: "propertyBuyerActivity_tenantId_tenants_id"
	}),
	dispoProperty_propertyId: one(dispoProperties, {
		fields: [propertyBuyerActivity.propertyId],
		references: [dispoProperties.id],
		relationName: "propertyBuyerActivity_propertyId_dispoProperties_id"
	}),
}));

export const propertyStageHistoryRelations = relations(propertyStageHistory, ({one}) => ({
	tenant: one(tenants, {
		fields: [propertyStageHistory.tenantId],
		references: [tenants.id]
	}),
	dispoProperty: one(dispoProperties, {
		fields: [propertyStageHistory.propertyId],
		references: [dispoProperties.id]
	}),
	user: one(users, {
		fields: [propertyStageHistory.changedByUserId],
		references: [users.id]
	}),
}));

export const rewardViewsRelations = relations(rewardViews, ({one}) => ({
	teamMember: one(teamMembers, {
		fields: [rewardViews.teamMemberId],
		references: [teamMembers.id]
	}),
	call: one(calls, {
		fields: [rewardViews.callId],
		references: [calls.id]
	}),
}));

export const syncLogRelations = relations(syncLog, ({one}) => ({
	tenant: one(tenants, {
		fields: [syncLog.tenantId],
		references: [tenants.id]
	}),
}));

export const teamAssignmentsRelations = relations(teamAssignments, ({one}) => ({
	teamMember_leadManagerId: one(teamMembers, {
		fields: [teamAssignments.leadManagerId],
		references: [teamMembers.id],
		relationName: "teamAssignments_leadManagerId_teamMembers_id"
	}),
	teamMember_acquisitionManagerId: one(teamMembers, {
		fields: [teamAssignments.acquisitionManagerId],
		references: [teamMembers.id],
		relationName: "teamAssignments_acquisitionManagerId_teamMembers_id"
	}),
}));

export const teamTrainingItemsRelations = relations(teamTrainingItems, ({one}) => ({
	call: one(calls, {
		fields: [teamTrainingItems.callReference],
		references: [calls.id]
	}),
	teamMember: one(teamMembers, {
		fields: [teamTrainingItems.teamMemberId],
		references: [teamMembers.id]
	}),
}));

export const tenantCallTypesRelations = relations(tenantCallTypes, ({one}) => ({
	tenant: one(tenants, {
		fields: [tenantCallTypes.tenantId],
		references: [tenants.id]
	}),
	tenantRubric: one(tenantRubrics, {
		fields: [tenantCallTypes.rubricId],
		references: [tenantRubrics.id]
	}),
}));

export const tenantRubricsRelations = relations(tenantRubrics, ({one, many}) => ({
	tenantCallTypes: many(tenantCallTypes),
	tenant: one(tenants, {
		fields: [tenantRubrics.tenantId],
		references: [tenants.id]
	}),
}));

export const tenantRolesRelations = relations(tenantRoles, ({one}) => ({
	tenant: one(tenants, {
		fields: [tenantRoles.tenantId],
		references: [tenants.id]
	}),
}));

export const userBadgesRelations = relations(userBadges, ({one}) => ({
	teamMember: one(teamMembers, {
		fields: [userBadges.teamMemberId],
		references: [teamMembers.id]
	}),
	badge: one(badges, {
		fields: [userBadges.badgeId],
		references: [badges.id]
	}),
	call: one(calls, {
		fields: [userBadges.triggerCallId],
		references: [calls.id]
	}),
}));

export const badgesRelations = relations(badges, ({many}) => ({
	userBadges: many(userBadges),
	xpTransactions: many(xpTransactions),
}));

export const userInstructionsRelations = relations(userInstructions, ({one}) => ({
	user: one(users, {
		fields: [userInstructions.userId],
		references: [users.id]
	}),
}));

export const userStreaksRelations = relations(userStreaks, ({one}) => ({
	teamMember: one(teamMembers, {
		fields: [userStreaks.teamMemberId],
		references: [teamMembers.id]
	}),
}));

export const userXpRelations = relations(userXp, ({one}) => ({
	teamMember: one(teamMembers, {
		fields: [userXp.teamMemberId],
		references: [teamMembers.id]
	}),
}));

export const webhookEventsRelations = relations(webhookEvents, ({one}) => ({
	tenant: one(tenants, {
		fields: [webhookEvents.tenantId],
		references: [tenants.id]
	}),
}));

export const webhookRetryQueueRelations = relations(webhookRetryQueue, ({one}) => ({
	tenant: one(tenants, {
		fields: [webhookRetryQueue.tenantId],
		references: [tenants.id]
	}),
	call: one(calls, {
		fields: [webhookRetryQueue.callId],
		references: [calls.id]
	}),
}));

export const xpTransactionsRelations = relations(xpTransactions, ({one}) => ({
	teamMember: one(teamMembers, {
		fields: [xpTransactions.teamMemberId],
		references: [teamMembers.id]
	}),
	call: one(calls, {
		fields: [xpTransactions.callId],
		references: [calls.id]
	}),
	badge: one(badges, {
		fields: [xpTransactions.badgeId],
		references: [badges.id]
	}),
}));