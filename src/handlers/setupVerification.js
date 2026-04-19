import {
    ActionRowBuilder,
    ModalBuilder,
    TextInputBuilder,
    TextInputStyle
} from 'discord.js';
import {
    buildVerificationMessageV2,
    buildSetupFeedbackV2,
    DEFAULT_VERIFICATION_TEXT
} from '../utils/embedBuilderV2.js';
import { getColors, getChannelId } from '../utils/configHelper.js';
import logger from '../utils/logger.js';

async function createVerificationMessage(interaction) {
    const verificationChannelId = getChannelId(interaction.guild.id, 'verification');
    let verificationChannel = verificationChannelId
        ? interaction.guild.channels.cache.get(verificationChannelId)
        : null;
    if (verificationChannel) {
        const botMember = interaction.guild.members.me;
        const permissions = verificationChannel.permissionsFor(botMember);
        if (!permissions?.has(['SendMessages', 'ViewChannel'])) {
            verificationChannel = null;
        }
    }
    const channel = verificationChannel || interaction.channel;
    const colors = getColors();
    const payload = buildVerificationMessageV2({
        bodyText: DEFAULT_VERIFICATION_TEXT,
        accentColor: colors.primary || 0x9b59b6,
        bannerUrl: null,
        guild: channel.guild,
        client: interaction.client
    });
    return channel.send(payload);
}

async function handleSetupVerification(interaction) {
    try {
        // Verificar se a interação ainda é válida
        if (interaction.replied || interaction.deferred) {
            console.warn('Tentativa de processar interação já respondida:', {
                interactionId: interaction.id,
                commandName: interaction.commandName,
                userId: interaction.user.id
            });
            return;
        }

        // Verificar permissões primeiro
        if (!interaction.member.permissions.has('ADMINISTRATOR')) {
            return await interaction.reply(buildSetupFeedbackV2({
                title: 'Acesso negado',
                description: 'Você precisa ser administrador para usar este comando!',
                accentColor: getColors().danger
            }));
        }

        // Modal simples: apenas banner (e opcionalmente cor)
        const modal = new ModalBuilder()
            .setCustomId('setup_verification_modal')
            .setTitle('Configurar Verificação');

        const bannerInput = new TextInputBuilder()
            .setCustomId('embed_banner')
            .setLabel('URL do Banner')
            .setStyle(TextInputStyle.Short)
            .setRequired(false)
            .setPlaceholder('https://exemplo.com/banner.png')
            .setValue('');

        const colorInput = new TextInputBuilder()
            .setCustomId('embed_color')
            .setLabel('Cor de destaque (hex, ex: 9b59b6)')
            .setStyle(TextInputStyle.Short)
            .setRequired(false)
            .setPlaceholder('9b59b6')
            .setValue('9b59b6')
            .setMaxLength(6);

        const textInput = new TextInputBuilder()
            .setCustomId('embed_text')
            .setLabel('Texto principal (opcional)')
            .setStyle(TextInputStyle.Paragraph)
            .setRequired(false)
            .setPlaceholder('Deixe vazio para usar o texto padrão')
            .setValue(DEFAULT_VERIFICATION_TEXT)
            .setMaxLength(4000);

        const row1 = new ActionRowBuilder().addComponents(bannerInput);
        const row2 = new ActionRowBuilder().addComponents(colorInput);
        const row3 = new ActionRowBuilder().addComponents(textInput);

        modal.addComponents(row1, row2, row3);

        // Mostrar o modal
        await interaction.showModal(modal);

    } catch (error) {
        logger.error('Erro ao abrir modal de verificação', {
            error: error.message,
            stack: error.stack,
            userId: interaction.user.id
        });

        const errPayload = buildSetupFeedbackV2({
            title: 'Erro',
            description: 'Ocorreu um erro ao abrir o formulário de configuração.',
            accentColor: getColors().danger
        });

        try {
            if (interaction.replied || interaction.deferred) {
                await interaction.editReply(errPayload);
            } else {
                await interaction.reply(errPayload);
            }
        } catch (replyError) {
            console.error('Erro ao enviar mensagem de erro:', replyError);
        }
    }
}

export { createVerificationMessage, handleSetupVerification };
