import { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ModalBuilder, TextInputBuilder, TextInputStyle } from 'discord.js';
import { mergeEmbedWithRows, toEmbedReply } from '../utils/embedBuilderV2.js';

import { database as db } from '../database/database.js';
import { getColors, getChannelId } from '../utils/configHelper.js';
import logger from '../utils/logger.js';

async function createWhitelistMessage(interaction) {
    // Tentar usar o canal de whitelist configurado (wl-mine), senão usar o canal atual
    const whitelistChannelId = getChannelId(interaction.guild.id, 'whitelist');
    let whitelistChannel = whitelistChannelId 
        ? interaction.guild.channels.cache.get(whitelistChannelId) 
        : null;
    
    // Se o canal configurado existe, verificar permissões
    if (whitelistChannel) {
        const botMember = interaction.guild.members.me;
        const permissions = whitelistChannel.permissionsFor(botMember);
        if (!permissions?.has(['SendMessages', 'EmbedLinks', 'ViewChannel'])) {
            // Se não tem permissão, usar canal atual
            whitelistChannel = null;
        }
    }
    
    const channel = whitelistChannel || interaction.channel;
    const colors = getColors();
    const embed = new EmbedBuilder()
        .setColor(colors.primary || 0x9b59b6)
        .setAuthor({ 
            name: 'Sistema de Whitelist', 
            iconURL: channel.guild.iconURL({ dynamic: true }) || undefined 
        })
        .setTitle('🎮 Whitelist do Servidor Minecraft')
        .setDescription(`Bem-vindo(a) ao sistema de whitelist do servidor **${channel.guild.name}**!\n\nPara jogar no servidor, você precisa solicitar sua whitelist preenchendo o formulário abaixo.`)
        .setThumbnail(channel.guild.iconURL({ dynamic: true, size: 256 }) || interaction.client.user.displayAvatarURL({ dynamic: true }))
        .addFields(
            { 
                name: '📝 Como solicitar whitelist?', 
                value: 
                    '**1.** Clique no botão **"Solicitar Whitelist"** abaixo\n' +
                    '**2.** Preencha o formulário com seu **nome de usuário do Minecraft**\n' +
                    '**3.** Aguarde a análise e aprovação da equipe\n' +
                    '**4.** Uma vez aprovado, você poderá entrar no servidor!',
                inline: false
            },
            { 
                name: '⚠️ Informações Importantes', 
                value: 
                    '• Você precisa ter uma conta **Minecraft (Minecraft Pirata ou Bedrock Funcionando Também)**\n' +
                    '• O nome de usuário deve estar **correto** (case-sensitive)\n' +
                    '• O processo pode levar alguns minutos\n' +
                    '• Caso tenha dúvidas, entre em contato com a equipe',
                inline: false
            },
            {
                name: '✅ Após a Aprovação',
                value: 'Você receberá uma notificação e poderá entrar no servidor usando seu nome de usuário do Minecraft!',
                inline: false
            }
        )
        .setFooter({ 
            text: `${channel.guild.name} • Sistema de Whitelist`, 
            iconURL: interaction.client.user.displayAvatarURL({ dynamic: true }) 
        })
        .setTimestamp();

    const row = new ActionRowBuilder()
        .addComponents(
            new ButtonBuilder()
                .setCustomId('start_whitelist')
                .setLabel('Solicitar Whitelist')
                .setStyle(ButtonStyle.Primary)
                .setEmoji('🎮')
        );

    return channel.send(mergeEmbedWithRows(embed, [row]));
}

async function handleSetupWhitelist(interaction) {
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
            const embed = new EmbedBuilder()
                .setColor(getColors().danger)
                .setTitle('❌ Acesso Negado')
                .setDescription('Você precisa ser administrador para usar este comando!')
                .setFooter({ text: 'Permissão Negada', iconURL: interaction.guild.iconURL() })
                .setTimestamp();

            return await interaction.reply(toEmbedReply(embed, true));
        }

        // Criar embed padrão para mostrar no modal
        const defaultEmbed = new EmbedBuilder()
            .setColor(getColors().primary || 0x9b59b6)
            .setAuthor({ 
                name: 'Sistema de Whitelist', 
                iconURL: interaction.guild.iconURL({ dynamic: true }) || undefined 
            })
            .setTitle('🎮 Whitelist do Servidor Minecraft')
            .setDescription(`Bem-vindo(a) ao sistema de whitelist do servidor **${interaction.guild.name}**!\n\nPara jogar no servidor, você precisa solicitar sua whitelist preenchendo o formulário abaixo.`)
            .setThumbnail(interaction.guild.iconURL({ dynamic: true, size: 256 }) || interaction.client.user.displayAvatarURL({ dynamic: true }))
            .addFields(
                { 
                    name: '📝 Como solicitar whitelist?', 
                    value: 
                        '**1.** Clique no botão **"Solicitar Whitelist"** abaixo\n' +
                        '**2.** Preencha o formulário com seu **nome de usuário do Minecraft**\n' +
                        '**3.** Aguarde a análise e aprovação da equipe\n' +
                        '**4.** Uma vez aprovado, você poderá entrar no servidor!',
                    inline: false
                },
                { 
                    name: '⚠️ Informações Importantes', 
                    value: 
                        '• Você precisa ter uma conta **Minecraft (Minecraft Pirata ou Bedrock Funcionando Também)**\n' +
                        '• O nome de usuário deve estar **correto** (case-sensitive)\n' +
                        '• O processo pode levar alguns minutos\n' +
                        '• Caso tenha dúvidas, entre em contato com a equipe',
                    inline: false
                },
                {
                    name: '✅ Após a Aprovação',
                    value: 'Você receberá uma notificação e poderá entrar no servidor usando seu nome de usuário do Minecraft!',
                    inline: false
                }
            )
            .setFooter({ 
                text: `${interaction.guild.name} • Sistema de Whitelist`, 
                iconURL: interaction.client.user.displayAvatarURL({ dynamic: true }) 
            })
            .setTimestamp();

        // Serializar o embed padrão para JSON
        const defaultEmbedJson = JSON.stringify(defaultEmbed.toJSON(), null, 2);

        // Criar modal para editar o embed
        const modal = new ModalBuilder()
            .setCustomId('setup_whitelist_modal')
            .setTitle('Configurar Embed de Whitelist');

        const titleInput = new TextInputBuilder()
            .setCustomId('embed_title')
            .setLabel('Título do Embed')
            .setStyle(TextInputStyle.Short)
            .setRequired(true)
            .setPlaceholder('Ex: 🎮 Whitelist do Servidor Minecraft')
            .setValue('🎮 Whitelist do Servidor Minecraft')
            .setMaxLength(256);

        const descriptionInput = new TextInputBuilder()
            .setCustomId('embed_description')
            .setLabel('Descrição do Embed')
            .setStyle(TextInputStyle.Paragraph)
            .setRequired(true)
            .setPlaceholder('Descrição do embed...')
            .setValue(defaultEmbed.data.description || '')
            .setMaxLength(4000);

        const fieldsInput = new TextInputBuilder()
            .setCustomId('embed_fields')
            .setLabel('Campos do Embed (JSON - Opcional)')
            .setStyle(TextInputStyle.Paragraph)
            .setRequired(false)
            .setPlaceholder('Cole aqui o JSON dos campos ou deixe vazio para usar os padrões')
            .setValue('')
            .setMaxLength(4000);

        const imageInput = new TextInputBuilder()
            .setCustomId('embed_image')
            .setLabel('URL da Imagem (Opcional)')
            .setStyle(TextInputStyle.Short)
            .setRequired(false)
            .setPlaceholder('https://exemplo.com/imagem.png')
            .setValue('');

        const thumbnailInput = new TextInputBuilder()
            .setCustomId('embed_thumbnail')
            .setLabel('URL do Thumbnail (Opcional)')
            .setStyle(TextInputStyle.Short)
            .setRequired(false)
            .setPlaceholder('https://exemplo.com/thumbnail.png')
            .setValue('');

        const row1 = new ActionRowBuilder().addComponents(titleInput);
        const row2 = new ActionRowBuilder().addComponents(descriptionInput);
        const row3 = new ActionRowBuilder().addComponents(fieldsInput);
        const row4 = new ActionRowBuilder().addComponents(imageInput);
        const row5 = new ActionRowBuilder().addComponents(thumbnailInput);

        modal.addComponents(row1, row2, row3, row4, row5);

        // Mostrar o modal
        await interaction.showModal(modal);
        
    } catch (error) {
        logger.error('Erro ao abrir modal de whitelist', {
            error: error.message,
            stack: error.stack,
            userId: interaction.user.id
        });

        const errorEmbed = new EmbedBuilder()
            .setColor(getColors().danger)
            .setTitle('❌ Erro')
            .setDescription('Ocorreu um erro ao abrir o formulário de configuração.')
            .setFooter({ text: 'Erro', iconURL: interaction.guild?.iconURL() })
            .setTimestamp();

        try {
            if (interaction.replied || interaction.deferred) {
                await interaction.editReply(toEmbedReply(errorEmbed, true));
            } else {
                await interaction.reply(toEmbedReply(errorEmbed, true));
            }
        } catch (replyError) {
            console.error('Erro ao enviar mensagem de erro:', replyError);
        }
    }
}

export { createWhitelistMessage, handleSetupWhitelist };

