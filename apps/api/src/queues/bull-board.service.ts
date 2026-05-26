import { Injectable, OnModuleInit } from '@nestjs/common';
import { createBullBoard } from '@bull-board/api';
import { ExpressAdapter } from '@bull-board/express';
import { HttpAdapterHost } from '@nestjs/core';
import type { NextFunction, Request, Response, Router } from 'express';
import { QueuesService } from './queues.service';

interface MountableHttpServer {
  use: (
    path: string,
    middleware: (
      request: Request,
      response: Response,
      next: NextFunction,
    ) => void,
    router: Router,
  ) => void;
}

@Injectable()
export class BullBoardService implements OnModuleInit {
  constructor(
    private readonly httpAdapterHost: HttpAdapterHost,
    private readonly queuesService: QueuesService,
  ) {}

  onModuleInit(): void {
    if (process.env.BULL_BOARD_ENABLED === 'false') {
      return;
    }

    const basePath = '/admin/queues';
    const serverAdapter = new ExpressAdapter();
    serverAdapter.setBasePath(basePath);
    createBullBoard({
      queues: this.queuesService.getBullBoardAdapters(),
      serverAdapter,
    });

    const instance =
      this.httpAdapterHost.httpAdapter.getInstance<MountableHttpServer>();
    const router = serverAdapter.getRouter() as unknown as Router;
    instance.use(basePath, this.basicAuthMiddleware, router);
  }

  private readonly basicAuthMiddleware = (
    request: Request,
    response: Response,
    next: NextFunction,
  ): void => {
    const expectedUser = process.env.BULL_BOARD_USER ?? 'admin';
    const expectedPassword = process.env.BULL_BOARD_PASSWORD ?? 'change_me';
    const authorization = request.headers.authorization;

    if (!authorization?.startsWith('Basic ')) {
      this.reject(response);
      return;
    }

    const credentials = Buffer.from(
      authorization.slice('Basic '.length),
      'base64',
    ).toString('utf8');
    const [user, password] = credentials.split(':');

    if (user !== expectedUser || password !== expectedPassword) {
      this.reject(response);
      return;
    }

    next();
  };

  private reject(response: Response): void {
    response.setHeader('WWW-Authenticate', 'Basic realm="Bull Board"');
    response.status(401).send('Authentication required.');
  }
}
