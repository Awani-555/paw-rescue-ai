// Shared by HelpOptInPrompt (turning alerts on) and AlertOptOutToggle
// (turning them off), so both read/write the same localStorage flag.
export const HELP_OPTIN_CHOICE_KEY = 'pawrescue_help_optin_choice'

export function getHelpOptInChoice() {
  return localStorage.getItem(HELP_OPTIN_CHOICE_KEY)
}

export function setHelpOptInChoice(choice) {
  localStorage.setItem(HELP_OPTIN_CHOICE_KEY, choice)
}
