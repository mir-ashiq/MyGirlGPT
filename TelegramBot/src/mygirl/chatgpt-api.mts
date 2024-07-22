import { Configuration, OpenAIApi } from 'openai';
import dotenv from 'dotenv';
import KeyvRedis from '@keyv/redis';
import Keyv from 'keyv';
import QuickLRU from 'quick-lru';
import _ from 'lodash';

dotenv.config();
const API_KEY = process.env.API_KEY as string;
const API_BASE_URL = process.env.GPT_SERVER as string;
const REDIS_URL = process.env.REDIS_SERVER as string;

export class OpenAIChatAPIWrapper {
  private openai: OpenAIApi;
  private messageStore: Keyv;

  constructor() {
    const configuration = new Configuration({
      apiKey: API_KEY,
      basePath: API_BASE_URL,
    });
    this.openai = new OpenAIApi(configuration);

    let kvStore: KeyvRedis | QuickLRU<any, any>;
    if (REDIS_URL && _.startsWith(REDIS_URL, 'redis://')) {
      kvStore = new KeyvRedis(REDIS_URL);
    } else {
      kvStore = new QuickLRU<string, any>({ maxSize: 10000 });
    }
    this.messageStore = new Keyv({ store: kvStore, namespace: 'MyGirlGPT-chatHistory' });
  }

  async sendMessage(text: string, opts?: { parentMessageId?: string }): Promise<any> {
    const response = await this.openai.createChatCompletion({
      model: 'gpt-3.5-turbo',
      messages: [{ role: 'user', content: text }],
    });

    const messageContent = response.data.choices[0].message?.content;
    const message = {
      id: response.data.id,
      text: messageContent,
      parentMessageId: opts?.parentMessageId,
    };

    await this.messageStore.set(message.id, message);
    return message;
  }

  async resetSession(messageId: string) {
    let currentMessageId = messageId;
    while (true) {
      const currentMessage = await this.messageStore.get(currentMessageId);
      if (!currentMessage) break;
      await this.messageStore.delete(currentMessageId);
      if (!currentMessage.parentMessageId) break;
      currentMessageId = currentMessage.parentMessageId;
    }
  }
}

const openAIChatAPI = new OpenAIChatAPIWrapper();
export { openAIChatAPI };
