import { handleVerificationStart } from './verificationStart.js';
import { handleVerificationModal } from './verificationModal.js';
import { handleVerificationAction } from './verificationAction.js';
import { handleVerificationStats } from './verificationStats.js';
import { handleClearDatabase } from './clearDatabase.js';
import { handleSetupVerification } from './setupVerification.js';
import { handleWhitelistStart } from './whitelistStart.js';
import { handleWhitelistModal } from './whitelistModal.js';
import { handleWhitelistPlatform } from './whitelistPlatform.js';
import { handleWhitelistAction } from './whitelistAction.js';
import { handleSetupWhitelist } from './setupWhitelist.js';
import { handleWhitelistList } from './whitelistList.js';
import { handleWhitelistInfo } from './whitelistInfo.js';
import { handleWhitelistRemove, handleWhitelistRemoveConfirm } from './whitelistRemove.js';
import { handleWhitelistClear, handleWhitelistClearConfirm } from './whitelistClear.js';
import { handleWhitelistToggleButton } from './whitelistToggleButton.js';
import { handleVerificationToggleButton } from './verificationToggleButton.js';
import { handleBanCommand } from '../commands/moderation/ban.js';
import { handleKickCommand } from '../commands/moderation/kick.js';
import { handleUnbanCommand } from '../commands/moderation/unban.js';
import { handleFirstLadyCommand } from '../commands/moderation/firstLady.js';
import { handleNukeCommand } from '../commands/moderation/nuke.js';
import { handleConfigCommand } from '../commands/admin/config.js';
import { handleConfigValidateCommand } from '../commands/admin/configValidate.js';
import { handleCreateEmbedCommand } from '../commands/admin/createEmbed.js';
import { handleSayCommand } from '../commands/admin/say.js';
import { handleEmbedButton, handleEmbedModal, handleEmbedSelectMenu } from './embedBuilder.js';
import { handleTestLogsCommand } from '../commands/admin/testLogs.js';
import { handleHelpCommand } from '../commands/info/help.js';
import { handleStatusCommand } from '../commands/info/status.js';
import { handleYoutubeCommand } from '../commands/media/youtube.js';
import { MessageFlags } from 'discord.js';
import { checkCooldown, formatCooldown } from '../utils/cooldown.js';
import { error } from '../utils/responseUtils.js';

const interactionQueue = new Map();

async function safeReply(interaction, options) {
    // Early return if interaction is already handled
    if (interaction.replied || interaction.deferred) {
        const editOpts = { ...options };
        if (editOpts.ephemeral) {
            editOpts.flags = (editOpts.flags || 0) | MessageFlags.Ephemeral;
            delete editOpts.ephemeral;
        }
        return interaction.editReply(editOpts).catch(e => {
            if (e.code === 10008) {
                console.warn('safeReply editReply: mensagem de resposta inexistente ou expirada', {
                    interactionId: interaction.id
                });
                return null;
            }
            console.error('Error in editReply:', e);
            throw e;
        });
    }

    try {
        let responseOptions = { ...options };

        const wantEphemeral = Boolean(responseOptions.ephemeral);
        if (responseOptions.ephemeral) {
            responseOptions.flags = (responseOptions.flags || 0) | MessageFlags.Ephemeral;
            delete responseOptions.ephemeral;
        }

        if (responseOptions.isError) {
            const errPayload = error({
                title: responseOptions.title || 'Erro',
                description: responseOptions.content || responseOptions.description || 'Ocorreu um erro inesperado.',
                ephemeral: wantEphemeral
            });
            delete responseOptions.isError;
            delete responseOptions.title;
            delete responseOptions.content;
            delete responseOptions.description;
            responseOptions = { ...responseOptions, ...errPayload };
        }

        const hasBody = Boolean(
            responseOptions.content
            || responseOptions.embeds?.length
            || responseOptions.components?.length
        );
        if (!hasBody) {
            Object.assign(responseOptions, error({
                title: 'Erro de Desenvolvimento',
                description: 'Esta resposta não contém conteúdo válido.',
                ephemeral: true
            }));
        }

        return await interaction.reply(responseOptions);
    } catch (err) {
        console.error('Error in safeReply:', err);

        if (!interaction.replied && !interaction.deferred) {
            try {
                await interaction.reply(error({
                    title: 'Erro',
                    description: 'Ocorreu um erro ao processar sua solicitação.',
                    ephemeral: true
                }));
            } catch (replyError) {
                console.error('Failed to send error message:', replyError);
            }
        }
        throw err;
    }
}

async function processInteractionQueue(interaction) {
    // Skip confirmation buttons and select menus - they're handled by awaitMessageComponent
    if ((interaction.isButton() || interaction.isStringSelectMenu()) && 
        (interaction.customId?.startsWith('confirm_first_lady_') || 
         interaction.customId?.startsWith('cancel_first_lady_') ||
         interaction.customId?.startsWith('confirm_remove_first_lady_') ||
         interaction.customId?.startsWith('cancel_remove_first_lady_') ||
         interaction.customId?.startsWith('remove_first_lady_select_') ||
         interaction.customId === 'confirm_kick' ||
         interaction.customId === 'cancel_kick' ||
         interaction.customId === 'confirm_ban' ||
         interaction.customId === 'cancel_ban' ||
         interaction.customId === 'confirm_unban' ||
         interaction.customId === 'cancel_unban')) {
        // Don't process these - let awaitMessageComponent handle them
        return;
    }
    
    // Para interações de botão de whitelist, usamos uma chave baseada na mensagem
    // para evitar que cliques múltiplos (double click) processem a mesma ficha
    // mais de uma vez ao mesmo tempo.
    let key = `${interaction.type}_${interaction.id}`;
    if (interaction.isButton() && interaction.customId?.startsWith('whitelist_') && interaction.message?.id) {
        key = `whitelist_message_${interaction.message.id}`;
    }
    
    // Skip if already processing this interaction
    if (interactionQueue.has(key)) {
        console.log(`[${new Date().toISOString()}] Skipping duplicate interaction:`, {
            id: interaction.id,
            type: interaction.type,
            customId: interaction.customId || 'N/A',
            isButton: interaction.isButton(),
            isCommand: interaction.isCommand()
        });
        return;
    }
    
    // Add to queue and set cleanup timeout
    interactionQueue.set(key, true);
    setTimeout(() => {
        interactionQueue.delete(key);
    }, 30000); // Clean up after 30s
    
    try {
        // Handle button interactions
        if (interaction.isButton()) {
            // For verification buttons, we'll handle deferral in their respective handlers
            if (interaction.customId.startsWith('verify_')) {
                return await handleVerificationAction(interaction);
            }
            // For start verification button
            if (interaction.customId === 'start_verification') {
                return await handleVerificationStart(interaction);
            }
            
            if (interaction.customId.startsWith('verify_approve_') || 
                interaction.customId.startsWith('verify_deny_')) {
                return await handleVerificationAction(interaction);
            }

            // For start whitelist button
            if (interaction.customId === 'start_whitelist') {
                return await handleWhitelistStart(interaction);
            }
            
            // Handler para botões de seleção de plataforma (Java/Bedrock) - DEVE VIR ANTES do handler genérico
            if (interaction.customId.startsWith('whitelist_platform_')) {
                return await handleWhitelistPlatform(interaction);
            }
            
            // Handler para botões de toggle de whitelist (ativar/desativar)
            if (interaction.customId.startsWith('wl_confirm_') || interaction.customId.startsWith('wl_cancel_')) {
                return await handleWhitelistToggleButton(interaction);
            }
            
            // Handler para botões de toggle de verificação (ativar/desativar)
            if (interaction.customId.startsWith('verification_confirm_') || interaction.customId.startsWith('verification_cancel_')) {
                return await handleVerificationToggleButton(interaction);
            }
            
            // Handler para botões de remoção de whitelist
            if (interaction.customId.startsWith('wl_remove_confirm_') || interaction.customId.startsWith('wl_remove_cancel_')) {
                return await handleWhitelistRemoveConfirm(interaction);
            }
            
            // Handler para botões de limpeza de whitelist
            if (interaction.customId.startsWith('wl_clear_confirm_') || interaction.customId.startsWith('wl_clear_cancel_')) {
                return await handleWhitelistClearConfirm(interaction);
            }
            
            // For whitelist approve/deny buttons
            if (interaction.customId.startsWith('whitelist_approve_') || 
                interaction.customId.startsWith('whitelist_deny_')) {
                return await handleWhitelistAction(interaction);
            }
            
            // For other whitelist buttons (genérico - deve vir por último)
            if (interaction.customId.startsWith('whitelist_')) {
                return await handleWhitelistAction(interaction);
            }

            // Handle config clear confirmation buttons
            if (interaction.customId === 'config_clear_confirm' || interaction.customId === 'config_clear_cancel') {
                const { handleConfigButton } = await import('../commands/admin/config.js');
                return await handleConfigButton(interaction);
            }

            // Handle first lady confirmation buttons and select menus
            // These are handled inline in the command handler via awaitMessageComponent
            // We need to completely ignore them here so awaitMessageComponent can handle them
            if (interaction.customId.startsWith('confirm_first_lady_') || 
                interaction.customId.startsWith('cancel_first_lady_') ||
                interaction.customId.startsWith('confirm_remove_first_lady_') ||
                interaction.customId.startsWith('cancel_remove_first_lady_') ||
                interaction.customId.startsWith('remove_first_lady_select_')) {
                // Don't process these - they're handled by awaitMessageComponent in the command
                // Return early without adding to queue to allow awaitMessageComponent to work
                return;
            }
            
            // Handler para construtor de embeds
            if (interaction.customId.startsWith('embed')) {
                return await handleEmbedButton(interaction);
            }
        }

        // Handle select menus do construtor de embeds
        if (interaction.isStringSelectMenu() || interaction.isChannelSelectMenu?.()) {
            if (interaction.customId === 'embedSend' ||
                interaction.customId === 'embedSendWebhookSelect' ||
                interaction.customId === 'embedSendWebhookChannel' ||
                interaction.customId === 'embedRemoveField' ||
                interaction.customId === 'embedLoad' ||
                interaction.customId === 'embedEditFieldSelect') {
                return await handleEmbedSelectMenu(interaction);
            }
        }

        if (interaction.isCommand()) {
            // Ensure we only handle the command once
            if (interaction.replied || interaction.deferred) {
                console.log(`[${new Date().toISOString()}] Command already handled:`, interaction.commandName);
                return;
            }
            
            // Verificar cooldown (exceto para comandos de help e status)
            if (interaction.commandName !== 'help' && interaction.commandName !== 'status') {
                const cooldownRemaining = checkCooldown(interaction.user.id, interaction.commandName);
                if (cooldownRemaining !== null) {
                    return await interaction.reply(error({
                        title: '⏱️ Cooldown',
                        description: `Você precisa esperar ${formatCooldown(cooldownRemaining)} antes de usar este comando novamente.`,
                        ephemeral: true
                    }));
                }
            }
            
            // Add a small delay to prevent race conditions
            await new Promise(resolve => setTimeout(resolve, 100));
            
            try {
                switch (interaction.commandName) {
                    case 'setup-verification':
                        return await handleSetupVerification(interaction);
                    case 'verification-stats':
                        return await handleVerificationStats(interaction);
                    case 'clear-database':
                        return await handleClearDatabase(interaction);
                    case 'setup-whitelist':
                    case 'wl':
                        return await handleSetupWhitelist(interaction);
                    case 'wl-list':
                        return await handleWhitelistList(interaction);
                    case 'wl-info':
                        return await handleWhitelistInfo(interaction);
                    case 'wl-remove':
                        return await handleWhitelistRemove(interaction);
                    case 'wl-clear':
                        return await handleWhitelistClear(interaction);
                    case 'ban':
                        return await handleBanCommand(interaction);
                    case 'kick':
                        return await handleKickCommand(interaction);
                    case 'unban':
                        return await handleUnbanCommand(interaction);
                    case 'nuke':
                        return await handleNukeCommand(interaction);
                    case 'pd':
                        return await handleFirstLadyCommand(interaction);
                    case 'config':
                        return await handleConfigCommand(interaction);
                    case 'config-validar':
                        return await handleConfigValidateCommand(interaction);
                case 'testar-logs':
                    return await handleTestLogsCommand(interaction);
                case 'verification': {
                    const { handleVerificationToggleCommand } = await import('../commands/admin/verificationToggle.js');
                    return await handleVerificationToggleCommand(interaction);
                }
                case 'wl-ativar': {
                    const { handleWhitelistToggleCommand } = await import('../commands/admin/whitelistToggle.js');
                    return await handleWhitelistToggleCommand(interaction);
                }
                case 'whitelist-config': {
                    const { handleWhitelistConfigCommand } = await import('../commands/admin/whitelistConfig.js');
                    return await handleWhitelistConfigCommand(interaction);
                }
                case 'criar':
                    return await handleCreateEmbedCommand(interaction);
                case 'say':
                    return await handleSayCommand(interaction);
                case 'help':
                    return await handleHelpCommand(interaction);
                case 'status':
                    return await handleStatusCommand(interaction);
                case 'youtube':
                    return await handleYoutubeCommand(interaction);
                }
            } catch (commandError) {
                // Se a interação já foi respondida, não tentar responder novamente
                if (commandError.code === 40060 || interaction.replied || interaction.deferred) {
                    console.error('Erro ao processar comando (interação já respondida):', commandError.message);
                    return;
                }
                
                // Tentar enviar mensagem de erro apenas se ainda não foi respondido
                if (!interaction.replied && !interaction.deferred) {
                    try {
                        await interaction.reply(error({
                            title: 'Erro',
                            description: 'Ocorreu um erro ao executar este comando.',
                            ephemeral: true
                        }));
                    } catch (replyError) {
                        // Se falhar ao responder, apenas logar
                        console.error('Erro ao enviar mensagem de erro:', replyError.message);
                    }
                }
                throw commandError; // Re-throw para ser capturado pelo handler externo
            }
        }

        if (interaction.isModalSubmit()) {
            // Modal do construtor de embeds
            if (interaction.customId.startsWith('embed')) {
                return await handleEmbedModal(interaction);
            }
            // Handler para modal de configuração de whitelist
            if (interaction.customId === 'setup_whitelist_modal') {
                try {
                    if (interaction.replied || interaction.deferred) {
                        console.warn('Tentativa de processar submissão de modal já respondida', {
                            interactionId: interaction.id,
                            customId: interaction.customId,
                            userId: interaction.user.id
                        });
                        return;
                    }
                    const { handleSetupWhitelistModal } = await import('./setupWhitelistModal.js');
                    return await handleSetupWhitelistModal(interaction);
                } catch (error) {
                    console.error('Erro ao processar modal de setup whitelist', {
                        error: error.message,
                        interactionId: interaction.id,
                        customId: interaction.customId,
                        stack: error.stack
                    });
                    
                    if (!interaction.replied && !interaction.deferred) {
                        await interaction.reply({
                            content: '❌ Ocorreu um erro ao processar o formulário. Por favor, tente novamente.',
                            ephemeral: true
                        }).catch(console.error);
                    }
                }
            }
            
            // Handler para modal de configuração de verificação
            if (interaction.customId === 'setup_verification_modal') {
                try {
                    if (interaction.replied || interaction.deferred) {
                        console.warn('Tentativa de processar submissão de modal já respondida', {
                            interactionId: interaction.id,
                            customId: interaction.customId,
                            userId: interaction.user.id
                        });
                        return;
                    }
                    const { handleSetupVerificationModal } = await import('./setupVerificationModal.js');
                    return await handleSetupVerificationModal(interaction);
                } catch (error) {
                    console.error('Erro ao processar modal de setup verification', {
                        error: error.message,
                        interactionId: interaction.id,
                        customId: interaction.customId,
                        stack: error.stack
                    });
                    
                    if (!interaction.replied && !interaction.deferred) {
                        await interaction.reply({
                            content: '❌ Ocorreu um erro ao processar o formulário. Por favor, tente novamente.',
                            ephemeral: true
                        }).catch(console.error);
                    }
                }
            }
            
            if (interaction.customId === 'verification_modal') {
                try {
                    // Check if already handled
                    if (interaction.replied || interaction.deferred) {
                        console.warn('Tentativa de processar submissão de modal já respondida', {
                            interactionId: interaction.id,
                            customId: interaction.customId,
                            userId: interaction.user.id
                        });
                        return;
                    }
                    return await handleVerificationModal(interaction);
                } catch (error) {
                    console.error('Erro ao processar submissão de modal', {
                        error: error.message,
                        interactionId: interaction.id,
                        customId: interaction.customId,
                        stack: error.stack
                    });
                    
                    // Try to send an error message if possible
                    if (!interaction.replied && !interaction.deferred) {
                        await interaction.reply({
                            content: '❌ Ocorreu um erro ao processar seu formulário. Por favor, tente novamente.',
                            ephemeral: true
                        }).catch(console.error);
                    }
                }
            }
            // Handler para modal de whitelist (suporta java e bedrock)
            if (interaction.customId.startsWith('whitelist_modal')) {
                try {
                    // Check if already handled
                    if (interaction.replied || interaction.deferred) {
                        console.warn('Tentativa de processar submissão de modal já respondida', {
                            interactionId: interaction.id,
                            customId: interaction.customId,
                            userId: interaction.user.id
                        });
                        return;
                    }
                    return await handleWhitelistModal(interaction);
                } catch (error) {
                    console.error('Erro ao processar submissão de modal de whitelist', {
                        error: error.message,
                        interactionId: interaction.id,
                        customId: interaction.customId,
                        stack: error.stack
                    });
                    
                    // Try to send an error message if possible
                    if (!interaction.replied && !interaction.deferred) {
                        await interaction.reply({
                            content: '❌ Ocorreu um erro ao processar seu formulário de whitelist. Por favor, tente novamente.',
                            ephemeral: true
                        }).catch(console.error);
                    }
                }
            }
        }
    } catch (error) {
        console.error('Error processing interaction:', error);
        
        const errorMessage = '❌ Ocorreu um erro ao processar esta interação.';
        
        try {
            if (interaction.replied || interaction.deferred) {
                await safeReply(interaction, { content: errorMessage });
            } else {
                await safeReply(interaction, { 
                    content: errorMessage,
                    ephemeral: true 
                });
            }
        } catch (notifyErr) {
            console.warn('Não foi possível notificar erro ao utilizador', {
                code: notifyErr.code,
                message: notifyErr.message
            });
        }
    } finally {
        interactionQueue.delete(key);
    }
}

function handleInteraction(interaction, client) {
    if (
        !interaction.isCommand() &&
        !interaction.isButton() &&
        !interaction.isModalSubmit() &&
        !interaction.isAnySelectMenu?.() &&
        !interaction.isStringSelectMenu?.() &&
        !interaction.isChannelSelectMenu?.()
    ) {
        return;
    }
    
    // Processa a interação de forma assíncrona
    processInteractionQueue(interaction).catch(error => {
        console.error('Unhandled error in interaction handler:', error);
    });
}

export { handleInteraction };
