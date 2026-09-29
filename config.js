// Westzaan Cx Viewer — settings. The only file to edit when moving hosts or projects.
window.CX_CONFIG = {
  // APS app of type "Single Page Application" (PKCE, no secret). Paste its Client ID here.
  clientId: '1ywv7TdTeYrkDd9EX3vEgXA4LqoSyjZGwLGBGA137AcJ7SdO',
  // ACC project (Westzaan) and the folder that holds the generated data (Internal Check › Cx Viewer data)
  projectId: 'b.473abcba-e8ba-4d5b-861b-a5bef431d7d5',
  dataFolderId: 'urn:adsk.wipemea:fs.folder:co.rAE_ZqAiQuiV6BFoV8j2_w',
  viewerApi: 'streamingV2_EU',
  scopes: 'data:read viewables:read user-profile:read',
  // open the newest ACC version of each model (element mapping follows via DWG handles)
  latestVersions: true,
  // 20B/20D sit inside the 20A refinery: which areas' structure to show as context
  contextAreas: { '20B': ['20A'], '20D': ['20A'], '20C': ['20A'], '20E': ['20A'] },
};
