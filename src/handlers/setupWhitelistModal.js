import { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';
import { mergeV2WithRows, toV2FromEmbedBuilder } from '../utils/embedBuilderV2.js';

import { getColors, getChannelId } from '../utils/configHelper.js';
import logger from '../utils/logger.js';
import { createWhitelistMessage } from './setupWhitelist.js';

/**
 * Processa o modal de configuração de whitelist
 */
export async function handleSetupWhitelistModal(interaction) {
    try {
        await interaction.deferReply({ ephemeral: true });

        const title = interaction.fields.getTextInputValue('embed_title') || '🎮 Whitelist do Servidor Minecraft';
        const description = interaction.fields.getTextInputValue('embed_description') || '';
        const fieldsJson = interaction.fields.getTextInputValue('embed_fields')?.trim() || '';
        const imageUrl = interaction.fields.getTextInputValue('embed_image')?.trim() || '';
        const thumbnailUrl = interaction.fields.getTextInputValue('embed_thumbnail')?.trim() || '';

        // Validar descrição
        if (!description || description.trim().length === 0) {
            const errorEmbed = new EmbedBuilder()
                .setColor(getColors().danger)
                .setTitle('❌ Erro')
                .setDescription('A descrição do embed é obrigatória!')
                .setFooter({ text: 'Erro', iconURL: interaction.guild.iconURL() })
                .setTimestamp();

            return await interaction.editReply(toV2FromEmbedBuilder(errorEmbed, true));
        }

        // Criar embed customizado
        const colors = getColors();
        const embed = new EmbedBuilder()
            .setColor(colors.primary || 0x9b59b6)
            .setAuthor({ 
                name: 'Sistema de Whitelist', 
                iconURL: interaction.guild.iconURL({ dynamic: true }) || undefined 
            })
            .setTitle(title)
            .setDescription(description)
            .setFooter({ 
                text: `${interaction.guild.name} • Sistema de Whitelist`, 
                iconURL: interaction.client.user.displayAvatarURL({ dynamic: true }) 
            })
            .setTimestamp();

        // Adicionar thumbnail se fornecido
        if (thumbnailUrl && thumbnailUrl.startsWith('http')) {
            try {
                embed.setThumbnail(thumbnailUrl);
            } catch (error) {
                logger.warning('URL de thumbnail inválida', { url: thumbnailUrl });
            }
        } else if (!thumbnailUrl) {
            // Usar thumbnail padrão se não fornecido
            embed.setThumbnail(interaction.guild.iconURL({ dynamic: true, size: 256 }) || interaction.client.user.displayAvatarURL({ dynamic: true }));
        }

        // Adicionar imagem se fornecido
        if (imageUrl && imageUrl.startsWith('http')) {
            try {
                embed.setImage(imageUrl);
            } catch (error) {
                logger.warning('URL de imagem inválida', { url: imageUrl });
            }
        }

        // Processar campos JSON se fornecido
        if (fieldsJson) {
            try {
                const fields = JSON.parse(fieldsJson);
                if (Array.isArray(fields)) {
                    // Limitar a 25 campos (limite do Discord)
                    const limitedFields = fields.slice(0, 25);
                    embed.addFields(limitedFields);
                } else if (typeof fields === 'object' && fields.name && fields.value) {
                    // Campo único
                    embed.addFields(fields);
                }
            } catch (parseError) {
                logger.warning('Erro ao processar campos JSON do embed', {
                    error: parseError.message,
                    fieldsJson: fieldsJson.substring(0, 100)
                });
                // Continuar sem os campos se houver erro de parsing
            }
        } else {
            // Usar campos padrão se não fornecido
            embed.addFields(
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
            );
        }

        // Verificar qual canal será usado
        const whitelistChannelId = getChannelId(interaction.guild.id, 'whitelist');
        let whitelistChannel = whitelistChannelId 
            ? interaction.guild.channels.cache.get(whitelistChannelId) 
            : null;
        
        // Verificar permissões se o canal existe
        let willUseConfigChannel = false;
        if (whitelistChannel) {
            const botMember = interaction.guild.members.me;
            const permissions = whitelistChannel.permissionsFor(botMember);
            if (permissions?.has(['SendMessages', 'EmbedLinks', 'ViewChannel'])) {
                willUseConfigChannel = true;
            }
        }
        
        const channel = whitelistChannel || interaction.channel;

        // Criar botão
        const row = new ActionRowBuilder()
            .addComponents(
                new ButtonBuilder()
                    .setCustomId('start_whitelist')
                    .setLabel('Solicitar Whitelist')
                    .setStyle(ButtonStyle.Primary)
                    .setEmoji('🎮')
            );

        // Enviar mensagem
        await channel.send({
            ...mergeV2WithRows(toV2FromEmbedBuilder(embed, true), [row])
        });

        let successDescription = 'Mensagem de whitelist configurada com sucesso!';
        if (willUseConfigChannel && whitelistChannel) {
            successDescription += `\n\n📌 Mensagem criada no canal configurado: ${whitelistChannel} (wl-mine)`;
        } else {
            if (whitelistChannelId && whitelistChannel) {
                successDescription += `\n\n⚠️ Canal de whitelist (wl-mine) configurado mas sem permissões. Mensagem criada no canal atual.\nVerifique as permissões do bot no canal configurado.`;
            } else {
                successDescription += `\n\n⚠️ Canal de whitelist (wl-mine) não configurado. Mensagem criada no canal atual.\nUse \`/config canal tipo:whitelist canal:<canal>\` para configurar o canal wl-mine.`;
            }
        }
        
        const successEmbed = new EmbedBuilder()
            .setColor(getColors().success)
            .setTitle('✅ Sucesso!')
            .setDescription(successDescription)
            .setFooter({ text: 'Configuração', iconURL: interaction.guild.iconURL() })
            .setTimestamp();

        await interaction.editReply(toV2FromEmbedBuilder(successEmbed, true));

        logger.info('Mensagem de whitelist configurada via modal', {
            guildId: interaction.guild.id,
            userId: interaction.user.id,
            channelId: channel.id
        });
        
    } catch (error) {
        logger.error('Erro ao processar modal de whitelist', {
            error: error.message,
            stack: error.stack,
            userId: interaction.user.id
        });

        const errorEmbed = new EmbedBuilder()
            .setColor(getColors().danger)
            .setTitle('❌ Erro')
            .setDescription('Ocorreu um erro ao configurar a mensagem de whitelist.')
            .setFooter({ text: 'Erro', iconURL: interaction.guild?.iconURL() })
            .setTimestamp();

        try {
            if (interaction.replied || interaction.deferred) {
                await interaction.editReply(toV2FromEmbedBuilder(errorEmbed, true));
            } else {
                await interaction.reply(toV2FromEmbedBuilder(errorEmbed, true));
            }
        } catch (replyError) {
            console.error('Erro ao enviar mensagem de erro:', replyError);
        }
    }
}

