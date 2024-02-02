import { createServer } from "http";
import { exec } from "child_process";
import { mkdtemp, rm, rmdir, writeFile } from "fs/promises";
import { join } from "path";
import { tmpdir } from "os";
console.log("Running");

async function runTwelf(preludeTwelf, viewTwelf) {
  const tempTwelfDir = await mkdtemp(join(tmpdir(), "twelf-"));
  try {
    const preludeFile = join(tempTwelfDir, "prelude.elf");
    const viewFile = join(tempTwelfDir, "view.elf");
    await writeFile(preludeFile, preludeTwelf);
    await writeFile(viewFile, viewTwelf);

    const [error, stdout, stderr] = await new Promise((resolve) => {
      exec(
        `/twelf-ulimit.sh ${preludeFile} ${viewFile}`,
        (error, stdout, stderr) => {
          resolve([error, stdout, stderr]);
        }
      );
    });

    if (!error && stderr !== "") {
      return {
        error: true,
        msg: "Unexpected response from Twelf: stderr was nonempty but process returned success.",
      };
    } else if (error && error.code !== 137) {
      console.log({ error, stdout, stderr });
      return {
        error: true,
        msg: "Unexpected response from Twelf: process returned failure but was not terminated by SIGKILL.",
      };
    }

    const lines = stdout.trim().split("\n");
    if (!lines[0] || !lines[0].startsWith("Twelf ")) {
      return {
        error: true,
        msg: "Unexpected response from Twelf: standard header not provided",
      };
    }
    const version = lines[0].trim();

    if (
      lines[1] !== "%% OK %%" && // Server load
      lines[2] !== "%% OK %%" // set chatter 0
    ) {
      return {
        error: true,
        msg: "Unexpected response from Twelf: first chatter change was not successful",
      };
    }

    const output = [];
    let preludeLoaded;
    let server = null;
    if (
      lines[3] === "%% OK %%" // loadFile <prelude.elf>
    ) {
      // Successful prelude load: output result of view load
      preludeLoaded = true;
      if (
        lines[4] !== "%% OK %%" // set chatter 3
      ) {
        return {
          error: true,
          msg: "Unexpected response from Twelf: second chatter change was not successful",
        };
      }
      if (lines[5] !== `[Opening file ${viewFile}]`) {
        return {
          error: true,
          msg: "Unexpected response from Twelf: did not get expected 'opening file' message",
        };
      }

      let i = 6;
      while (i < lines.length && lines[i] !== `[Closing file ${viewFile}]`) {
        output.push(lines[i]);
        i += 1;
      }

      if (i === lines.length) {
        if (!error) {
          return {
            error: true,
            msg: "Unexpected response from Twelf: did not get expected 'closing file' message",
          };
        }
      } else {
        if (i !== lines.length - 2) {
          console.log(lines);
          return {
            error: true,
            msg: "Unexpected response from Twelf: 'closing file' message was not the next-to-last line",
          };
        }
        server = lines[i + 1];
      }
    } else {
      // Unsuccessful prelude load: output result of prelude load
      preludeLoaded = false;

      let i = 4;
      while (i < lines.length && lines[i] !== "%% ABORT %%") {
        output.push(lines[i]);
        i += 1;
      }
      if (lines[i] === "%% ABORT %%") {
        server = "%% ABORT %%";
      }
    }

    return {
      version,
      preludeLoaded,
      killed: !!error,
      server,
      output: output
        .join("\n")
        .replaceAll(preludeFile, "preulde.elf")
        .replaceAll(viewFile, "input.elf"),
    };
  } finally {
    await rm(tempTwelfDir, { recursive: true, force: true });
  }
}

createServer((req, resp) => {
  try {
    if (req.url === "/helloz") {
      if (req.method === "GET") {
        resp.writeHead(204).end();
      } else {
        resp.writeHead(405).end();
      }
    } else if (req.url === "/eval") {
      if (req.method === "POST") {
        let data = [];
        let size = 0;
        req.on("data", (chunk) => {
          size += chunk.size;
          if (size > 250000) {
            req.destroy();
            resp.writeHead(413).end(); // Request too large
          }
          data.push(chunk.toString());
        });
        req.on("end", () => {
          const twelfParts = data.join("").split("\0");
          if (data.length > 2) {
            resp.writeHead(400).end();
          } else {
            const [prelude, view] =
              twelfParts.length === 2 ? twelfParts : ["", twelfParts[0]];
            runTwelf(prelude, view)
              .then((result) => {
                resp.writeHead(200, { "content-type": "application/json" });
                resp.end(JSON.stringify(result));
              })
              .catch((e) => {
                console.log("Unexpected error calling Twelf");
                console.log(e);
                resp.writeHead(500).end();
              });
          }
        });
      } else {
        resp.writeHead(405).end();
      }
    } else {
      resp.writeHead(404).end();
    }
  } catch (e) {
    console.log(e);
    resp.writeHead(500).end();
  }
}).listen({ port: process.env.PORT, host: "0.0.0.0" });
