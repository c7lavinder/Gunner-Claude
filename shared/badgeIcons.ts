/**
 * Badge icon image URLs - Call of Duty-style custom badge icons
 * Maps badge codes to their CDN image URLs
 */
export const BADGE_ICON_URLS: Record<string, string> = {
  // Universal Badges
  on_fire: "https://files.manuscdn.com/user_upload_by_module/session_file/310519663328210645/ADHECdrwTDEqcggQ.png",
  comeback_kid: "https://files.manuscdn.com/user_upload_by_module/session_file/310519663328210645/OEkPWaJehIIQQahK.png",
  consistency_king: "https://files.manuscdn.com/user_upload_by_module/session_file/310519663328210645/FtxYvlNckQpgVCUe.png",

  // Lead Manager Badges
  script_starter: "https://files.manuscdn.com/user_upload_by_module/session_file/310519663328210645/JCyHQboGKYrkHOxq.png",
  motivation_miner: "https://files.manuscdn.com/user_upload_by_module/session_file/310519663328210645/xwFQZanSLiLrpyBU.png",
  price_anchor_pro: "https://files.manuscdn.com/user_upload_by_module/session_file/310519663328210645/tYuMlsNsMBiqXrHr.png",
  appointment_machine: "https://files.manuscdn.com/user_upload_by_module/session_file/310519663328210645/XDjidkEaBogMTeKZ.png",
  tone_master: "https://files.manuscdn.com/user_upload_by_module/session_file/310519663328210645/UzofuGPHIzEufQvJ.png",
  rapport_builder: "https://files.manuscdn.com/user_upload_by_module/session_file/310519663328210645/PYGkbvQWbXilQDPa.png",
  volume_dialer: "https://files.manuscdn.com/user_upload_by_module/session_file/310519663328210645/cKocvSCtMluzOJCb.png",

  // Acquisition Manager Badges
  offer_architect: "https://files.manuscdn.com/user_upload_by_module/session_file/310519663328210645/hXfSIBjLfZbFWquq.png",
  price_confidence: "https://files.manuscdn.com/user_upload_by_module/session_file/310519663328210645/buesVrTPQoCxtjYg.png",
  negotiator: "https://files.manuscdn.com/user_upload_by_module/session_file/310519663328210645/pRhlzHwUwFaTDvNR.png",
  clear_answer: "https://files.manuscdn.com/user_upload_by_module/session_file/310519663328210645/PBDjZZIVdDyEQvjF.png",
  closer: "https://files.manuscdn.com/user_upload_by_module/session_file/310519663328210645/GiMKWvRaUyyozhoM.png",

  // Lead Generator Badges
  conversation_starter: "https://files.manuscdn.com/user_upload_by_module/session_file/310519663328210645/XyFVvydiwYeltMQT.png",
  warm_handoff_pro: "https://files.manuscdn.com/user_upload_by_module/session_file/310519663328210645/XbVALeuoUYqFHmZn.png",
  objection_handler: "https://files.manuscdn.com/user_upload_by_module/session_file/310519663328210645/qgSnuKqgtmPWDXnE.png",
  interest_generator: "https://files.manuscdn.com/user_upload_by_module/session_file/310519663328210645/QVCogbkeVqcrjnXi.png",
  cold_call_warrior: "https://files.manuscdn.com/user_upload_by_module/session_file/310519663328210645/nYoEWLLSzlKanWtm.png",
};

/**
 * Get the CDN image URL for a badge code, with fallback to a default badge icon
 */
export function getBadgeIconUrl(code: string): string {
  return BADGE_ICON_URLS[code] || BADGE_ICON_URLS.on_fire;
}
