<#ftl output_format="plainText">
${msg("UserFirstName", link, linkExpiration, realmName, user.getFirstName())}

${msg("userMFAMessages")}

${msg("verifyEmailMessageMFA")}

${link}

${msg("linkExpiryNotice", linkExpirationFormatter(linkExpiration))}

${msg("regards")}
${msg("VisionwavesTeam")}
${msg("doNotReplyMessage")}
