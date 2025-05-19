import { Telegraf, session } from 'telegraf';
import { MyContext } from './types';
import { User } from './models/user';
import { Chat } from 'telegraf/typings/core/types/typegram';
import { BOT_TOKEN } from './config';
import { startText } from './models/text';

const bot = new Telegraf<MyContext>(BOT_TOKEN);

bot.use(session());

bot.use((ctx, next) => {
  try {
    if (!ctx.session) {
      ctx.session = {
        state: '',
        msgIds: [],
      };
    }
    return next();
  } catch (error) {
    console.error(error);
  }
});

bot.start(async (ctx) => {
  try {
    const tgId = ctx.chat.id;
    const username = (ctx.chat as Chat.PrivateChat).username;
    let user = await User.findOne({ tgId });
    if (!user) {
      const newUser = new User({
        tgId,
        username,
      });
      user = await newUser.save();
    }

    ctx.reply(startText(user));
  } catch (error) {
    console.error(error);
  }
});

export default bot;
