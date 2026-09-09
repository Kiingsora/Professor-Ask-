using System;
using System.Diagnostics;
using System.IO;
using System.Threading;

internal static class Program
{
    private static void Pump(Stream source, Stream destination, bool closeDestination)
    {
        try
        {
            var buffer = new byte[81920];
            int read;
            while ((read = source.Read(buffer, 0, buffer.Length)) > 0)
            {
                destination.Write(buffer, 0, read);
                destination.Flush();
            }
        }
        catch { }
        finally
        {
            if (closeDestination)
            {
                try { destination.Close(); } catch { }
            }
        }
    }

    private static void LogErrors(StreamReader stderr, string logPath)
    {
        try
        {
            using (var writer = new StreamWriter(logPath, true))
            {
                writer.AutoFlush = true;
                string line;
                while ((line = stderr.ReadLine()) != null)
                {
                    writer.WriteLine("[{0:O}] {1}", DateTime.UtcNow, line);
                }
            }
        }
        catch { }
    }

    public static int Main()
    {
        try
        {
            var baseDir = AppDomain.CurrentDomain.BaseDirectory;
            var nodePathFile = Path.Combine(baseDir, "node-path.txt");
            var hostScript = Path.Combine(baseDir, "host.js");
            var logPath = Path.Combine(baseDir, "native-host.log");

            if (!File.Exists(hostScript)) return 11;

            var nodePath = File.Exists(nodePathFile)
                ? File.ReadAllText(nodePathFile).Trim()
                : "node.exe";

            if (string.IsNullOrWhiteSpace(nodePath)) nodePath = "node.exe";

            var psi = new ProcessStartInfo
            {
                FileName = nodePath,
                Arguments = "\"" + hostScript + "\"",
                WorkingDirectory = baseDir,
                UseShellExecute = false,
                CreateNoWindow = true,
                WindowStyle = ProcessWindowStyle.Hidden,
                RedirectStandardInput = true,
                RedirectStandardOutput = true,
                RedirectStandardError = true
            };

            using (var child = Process.Start(psi))
            {
                if (child == null) return 12;

                var inputThread = new Thread(() => Pump(Console.OpenStandardInput(), child.StandardInput.BaseStream, true));
                var outputThread = new Thread(() => Pump(child.StandardOutput.BaseStream, Console.OpenStandardOutput(), false));
                var errorThread = new Thread(() => LogErrors(child.StandardError, logPath));

                inputThread.IsBackground = true;
                outputThread.IsBackground = true;
                errorThread.IsBackground = true;

                inputThread.Start();
                outputThread.Start();
                errorThread.Start();

                child.WaitForExit();
                try { outputThread.Join(1500); } catch { }
                return child.ExitCode;
            }
        }
        catch (Exception ex)
        {
            try
            {
                File.AppendAllText(
                    Path.Combine(AppDomain.CurrentDomain.BaseDirectory, "native-host.log"),
                    "[launcher] " + ex + Environment.NewLine
                );
            }
            catch { }
            return 10;
        }
    }
}
