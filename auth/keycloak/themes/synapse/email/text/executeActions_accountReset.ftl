<#ftl output_format="plainText">
${msg("UserFirstName", link, linkExpiration, realmName, user.getFirstName())}

${msg("userAccountResetMessage")}

${msg("verifyEmailMessageResetAccount")}

${link}

${msg("linkExpiryNotice", linkExpirationFormatter(linkExpiration))}

${msg("regards")}
${msg("VisionwavesTeam")}
${msg("doNotReplyMessage")}
