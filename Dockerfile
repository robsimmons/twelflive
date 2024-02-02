# syntax = docker/dockerfile:1
# To build:
# docker build --platform=linux/amd64 -t twelflive .
# To run:
# docker run -it twelflive

FROM node:21-bookworm-slim as base

FROM base as build

RUN apt-get update -qq && \
    apt-get install --no-install-recommends -y binutils curl libc-dev gcc make

WORKDIR /usr
RUN curl -L http://smlnj.cs.uchicago.edu/dist/working/110.99.4/config.tgz > sml.tgz
RUN tar xzvf sml.tgz
RUN config/install.sh

WORKDIR /
RUN curl -L http://twelf.org/releases/twelf-src-1.7.1.tar.gz > twelf.tgz
RUN tar xzvf twelf.tgz
WORKDIR /twelf
RUN make smlnj

FROM base

RUN apt-get update -qq && \
    apt-get install --no-install-recommends

COPY --from=build /usr/bin/.run-sml /usr/bin/.run-sml
COPY --from=build /usr/bin/sml /usr/bin/sml
COPY --from=build /usr/bin/.run/run.amd64-linux /usr/bin/.run/run.amd64-linux 
COPY --from=build /usr/bin/.arch-n-opsys /usr/bin/.arch-n-opsys 
COPY --from=build /twelf/bin/twelf-server /twelf/bin/twelf-server
COPY --from=build /twelf/bin/.heap/twelf-server.amd64-linux /twelf/bin/.heap/twelf-server.amd64-linux 
COPY server.mjs /server.mjs
COPY twelf-ulimit.sh /twelf-ulimit.sh

ENV PORT=3210
EXPOSE ${PORT}
CMD ["node", "server.mjs"]