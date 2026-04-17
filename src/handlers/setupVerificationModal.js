import { MessageFlags } from 'discord.js';
import { getColors, getChannelId } from '../utils/configHelper.js';
import logger from '../utils/logger.js';
import { buildVerificationMessageV2, buildSetupFeedbackV2 } from '../utils/embedBuilderV2.js';

/**
 * Processa o modal de configuração de verificação (Components V2: barra, texto, ícone do servidor, banner).
 */
export async function handleSetupVerificationModal(interaction) {
    try {
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });

        const bannerUrl = interaction.fields.getTextInputValue('embed_banner')?.trim() || '';
        const colorHex = interaction.fields.getTextInputValue('embed_color')?.trim() || '9b59b6';
        const embedText = interaction.fields.getTextInputValue('embed_text')?.trim() || '';

        let accentColor = getColors().primary || 0x9b59b6;
        if (colorHex) {
            const hex = colorHex.replace(/^#/, '').replace(/^0x/i, '');
            if (/^[0-9a-fA-F]{6}$/.test(hex)) {
                accentColor = parseInt(hex, 16);
            }
        }

        const verificationChannelId = getChannelId(interaction.guild.id, 'verification');
        let verificationChannel = verificationChannelId
            ? interaction.guild.channels.cache.get(verificationChannelId)
            : null;
        let willUseConfigChannel = false;
        if (verificationChannel) {
            const botMember = interaction.guild.members.me;
            const permissions = verificationChannel.permissionsFor(botMember);
            if (permissions?.has(['SendMessages', 'ViewChannel'])) {
                willUseConfigChannel = true;
            }
        }
        const channel = verificationChannel || interaction.channel;

        const verificationPayload = buildVerificationMessageV2({
            bodyText: embedText || undefined,
            accentColor,
            bannerUrl: bannerUrl || null,
            guild: interaction.guild,
            client: interaction.client
        });

        await channel.send(verificationPayload);

        let successDescription = 'Mensagem de verificação configurada com sucesso!';
        if (willUseConfigChannel && verificationChannel) {
            successDescription += `\n\n📌 Mensagem criada no canal configurado: ${verificationChannel}`;
        } else {
            if (verificationChannelId && verificationChannel) {
                successDescription += `\n\n⚠️ Canal de verificação configurado mas sem permissões. Mensagem criada no canal atual.\nVerifique as permissões do bot no canal configurado.`;
            } else {
                successDescription += `\n\n⚠️ Canal de verificação não configurado. Mensagem criada no canal atual.\nUse \`/config canal tipo:verification canal:<canal>\` para configurar.`;
            }
        }
        
        const successFeedback = buildSetupFeedbackV2({
            title: 'Sucesso',
            description: successDescription,
            accentColor: getColors().success
        });

        await interaction.editReply(successFeedback);

        logger.info('Mensagem de verificação configurada via modal', {
            guildId: interaction.guild.id,
            userId: interaction.user.id,
            channelId: channel.id
        });
        
    } catch (error) {
        logger.error('Erro ao processar modal de verificação', {
            error: error.message,
            stack: error.stack,
            userId: interaction.user.id
        });

        const { components, flags } = buildSetupFeedbackV2({
            title: 'Erro',
            description: 'Ocorreu um erro ao configurar a mensagem de verificação.',
            accentColor: getColors().danger
        });

        try {
            if (interaction.replied || interaction.deferred) {
                await interaction.editReply({
                    components,
                    flags
                });
            } else {
                await interaction.reply({
                    components,
                    flags
                });
            }
        } catch (replyError) {
            console.error('Erro ao enviar mensagem de erro:', replyError);
        }
    }
}

